const { Router } = require('express');
const { putEvent, deleteEvent } = require('../caldav/client');
const { serializeEvent, formatIcsDate } = require('../caldav/parser');
const { expandRecurring, setRruleUntil } = require('../caldav/recurrence');
const store = require('../cache/store');

const router = Router();

// ── GET /events ───────────────────────────────────────────

router.get('/events', (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
  const to   = req.query.to   ? new Date(req.query.to)   : new Date(Date.now() + 90 * 86400000);

  const result = [];
  for (const ev of store.getNonRecurringInRange(from, to)) {
    result.push(toApiShape(ev));
  }
  for (const ev of store.getRecurringBases()) {
    for (const occ of expandRecurring(ev, from, to)) {
      result.push(toApiShape(occ));
    }
  }
  result.sort((a, b) => new Date(a.start) - new Date(b.start));
  res.json(result);
});

// ── POST /events ──────────────────────────────────────────

router.post('/events', async (req, res) => {
  try {
    const { calendarId, title, start, end, allDay, description, location, rrule } = req.body;
    if (!calendarId || !title || !start) return res.status(400).json({ error: 'calendarId, title, start required' });

    const uid = crypto.randomUUID();
    const event = { uid, calendarId, title, start, end: end || start, allDay: !!allDay,
      description: description || '', location: location || '', rrule: rrule || null };
    const ics = serializeEvent(event);
    const { href, etag } = await putEvent(calendarId, uid, ics);
    const stored = { ...event, href, etag };
    store.setEvent(stored);
    res.status(201).json(toApiShape(stored));
  } catch (err) {
    console.error('POST /events:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── PUT /events/:id ───────────────────────────────────────

router.put('/events/:id', async (req, res) => {
  try {
    const { recurringScope, occurrenceDate, uid: baseUid, ...changes } = req.body;

    // For recurring occurrences, the request includes uid (base UID); otherwise use :id
    const existing = store.getEvent(baseUid || req.params.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    if (existing.rrule && recurringScope === 'single') {
      return handleSingleOccurrenceEdit(existing, changes, occurrenceDate, res);
    }
    if (existing.rrule && recurringScope === 'future') {
      return handleFutureEdit(existing, changes, occurrenceDate, res);
    }

    // Simple update (non-recurring, or 'all' scope on recurring base)
    const updated = { ...existing, ...filterChanges(changes) };
    const ics = serializeEvent(updated);
    const { href, etag } = await putEvent(existing.calendarId, existing.uid, ics, existing.etag);
    const stored = { ...updated, href, etag };
    store.setEvent(stored);
    res.json(toApiShape(stored));
  } catch (err) {
    console.error('PUT /events/:id:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── DELETE /events/:id ────────────────────────────────────

router.delete('/events/:id', async (req, res) => {
  try {
    const { scope, occurrenceDate, uid: baseUid } = req.query;
    const existing = store.getEvent(baseUid || req.params.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    if (existing.rrule && scope === 'single') {
      // Exclude this one occurrence by adding an EXDATE
      const exdateStr = formatIcsDate(new Date(occurrenceDate), existing.allDay);
      const updated = { ...existing, exdates: [...(existing.exdates || []), exdateStr] };
      const ics = serializeEvent(updated);
      const { href, etag } = await putEvent(existing.calendarId, existing.uid, ics, existing.etag);
      store.setEvent({ ...updated, href, etag });
      return res.status(204).end();
    }

    if (existing.rrule && scope === 'future') {
      // Trim the series to end just before this occurrence
      const until = new Date(new Date(occurrenceDate).getTime() - 1000);
      const updated = { ...existing, rrule: setRruleUntil(existing.rrule, until) };
      const ics = serializeEvent(updated);
      const { href, etag } = await putEvent(existing.calendarId, existing.uid, ics, existing.etag);
      store.setEvent({ ...updated, href, etag });
      return res.status(204).end();
    }

    // Delete all / non-recurring
    await deleteEvent(existing.href, existing.etag);
    store.removeEvent(existing.uid);
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /events/:id:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Recurring helpers ─────────────────────────────────────

async function handleSingleOccurrenceEdit(base, changes, occurrenceDate, res) {
  // 1. Add EXDATE to the base series so this occurrence is skipped
  const exdateStr = formatIcsDate(new Date(occurrenceDate), base.allDay);
  const updatedBase = { ...base, exdates: [...(base.exdates || []), exdateStr] };
  const baseIcs = serializeEvent(updatedBase);
  const { href: bHref, etag: bEtag } = await putEvent(base.calendarId, base.uid, baseIcs, base.etag);
  store.setEvent({ ...updatedBase, href: bHref, etag: bEtag });

  // 2. Create a standalone exception event for this occurrence
  const excUid = crypto.randomUUID();
  const exc = {
    ...filterChanges(changes),
    uid: excUid,
    calendarId: base.calendarId,
    allDay: base.allDay,
  };
  const excIcs = serializeEvent(exc);
  const { href: eHref, etag: eEtag } = await putEvent(base.calendarId, excUid, excIcs);
  const stored = { ...exc, href: eHref, etag: eEtag };
  store.setEvent(stored);
  res.status(201).json(toApiShape(stored));
}

async function handleFutureEdit(base, changes, occurrenceDate, res) {
  // 1. Trim the base series UNTIL to just before this occurrence
  const until = new Date(new Date(occurrenceDate).getTime() - 1000);
  const updatedBase = { ...base, rrule: setRruleUntil(base.rrule, until) };
  const baseIcs = serializeEvent(updatedBase);
  const { href: bHref, etag: bEtag } = await putEvent(base.calendarId, base.uid, baseIcs, base.etag);
  store.setEvent({ ...updatedBase, href: bHref, etag: bEtag });

  // 2. Create a new recurring series from this occurrence onward
  const newUid = crypto.randomUUID();
  const newEvent = {
    ...filterChanges(changes),
    uid: newUid,
    calendarId: base.calendarId,
    allDay: base.allDay,
    rrule: base.rrule, // original rule (no UNTIL)
  };
  const newIcs = serializeEvent(newEvent);
  const { href: nHref, etag: nEtag } = await putEvent(base.calendarId, newUid, newIcs);
  const stored = { ...newEvent, href: nHref, etag: nEtag };
  store.setEvent(stored);
  res.status(201).json(toApiShape(stored));
}

// ── Helpers ───────────────────────────────────────────────

function filterChanges(changes) {
  const allowed = ['title', 'start', 'end', 'allDay', 'description', 'location'];
  const out = {};
  for (const k of allowed) {
    if (k in changes) out[k] = changes[k];
  }
  return out;
}

function toApiShape(ev) {
  return {
    id: ev.id || ev.uid,
    uid: ev.uid,
    title: ev.title,
    start: ev.start,
    end: ev.end,
    allDay: ev.allDay,
    description: ev.description,
    location: ev.location,
    calendarId: ev.calendarId,
    recurring: ev.recurring || !!ev.rrule,
    occurrenceDate: ev.occurrenceDate || null,
  };
}

module.exports = router;
