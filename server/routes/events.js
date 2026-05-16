const { Router } = require('express');
const { RRule, rrulestr } = require('rrule');
const { putEvent, deleteEvent } = require('../caldav/client');
const { serializeEvent, formatIcsDate } = require('../caldav/parser');
const { expandRecurring, setRruleUntil, parseExdate } = require('../caldav/recurrence');
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
    const { calendarId, title, start, end, allDay, description, location, url, rrule, alarmMinutes, categories } = req.body;
    if (!calendarId || !title || !start) return res.status(400).json({ error: 'calendarId, title, start required' });

    const uid = crypto.randomUUID();
    const now = new Date().toISOString();
    const event = { uid, calendarId, title, start, end: end || start, allDay: !!allDay,
      description: description || '', location: location || '', url: url || '', rrule: rrule || null,
      alarmMinutes: alarmMinutes != null ? parseInt(alarmMinutes) : null,
      categories: Array.isArray(categories) ? categories : [] };
    const ics = serializeEvent(event);
    const { href, etag } = await putEvent(calendarId, uid, ics);
    const stored = { ...event, href, etag, localModifiedAt: now, lastSyncedAt: now };
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
    const now = new Date().toISOString();
    const stored = { ...updated, href, etag, localModifiedAt: now, lastSyncedAt: now };
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
  const now = new Date().toISOString();
  // 1. Add EXDATE to the base series so this occurrence is skipped
  const exdateStr = formatIcsDate(new Date(occurrenceDate), base.allDay);
  const updatedBase = { ...base, exdates: [...(base.exdates || []), exdateStr] };
  const baseIcs = serializeEvent(updatedBase);
  const { href: bHref, etag: bEtag } = await putEvent(base.calendarId, base.uid, baseIcs, base.etag);
  store.setEvent({ ...updatedBase, href: bHref, etag: bEtag, localModifiedAt: now, lastSyncedAt: now });

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
  const stored = { ...exc, href: eHref, etag: eEtag, localModifiedAt: now, lastSyncedAt: now };
  store.setEvent(stored);
  res.status(201).json(toApiShape(stored));
}

async function handleFutureEdit(base, changes, occurrenceDate, res) {
  const now = new Date().toISOString();
  // 1. Trim the base series UNTIL to just before this occurrence
  const until = new Date(new Date(occurrenceDate).getTime() - 1000);
  const updatedBase = { ...base, rrule: setRruleUntil(base.rrule, until) };
  const baseIcs = serializeEvent(updatedBase);
  const { href: bHref, etag: bEtag } = await putEvent(base.calendarId, base.uid, baseIcs, base.etag);
  store.setEvent({ ...updatedBase, href: bHref, etag: bEtag, localModifiedAt: now, lastSyncedAt: now });

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
  const stored = { ...newEvent, href: nHref, etag: nEtag, localModifiedAt: now, lastSyncedAt: now };
  store.setEvent(stored);
  res.status(201).json(toApiShape(stored));
}

// ── Helpers ───────────────────────────────────────────────

function filterChanges(changes) {
  const allowed = ['title', 'start', 'end', 'allDay', 'description', 'location', 'url', 'alarmMinutes', 'categories'];
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
    url: ev.url || '',
    categories: ev.categories || [],
    calendarId: ev.calendarId,
    recurring: ev.recurring || !!ev.rrule,
    rrule: ev.rrule || null,
    occurrenceDate: ev.occurrenceDate || null,
    alarmMinutes: ev.alarmMinutes ?? null,
  };
}

// ── POST /events/batch-shift ──────────────────────────────

router.post('/events/batch-shift', async (req, res) => {
  try {
    const { category, shiftDays } = req.body;
    if (!category || !shiftDays) return res.status(400).json({ error: 'category and shiftDays required' });

    const shiftMs = Math.round(shiftDays) * 86400000;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + shiftMs);

    const matching = store.getAllEvents().filter(ev =>
      (ev.categories || []).includes(category)
    );

    let shifted = 0, exdated = 0, skipped = 0;
    const errors = [];

    for (const ev of matching) {
      try {
        if (!ev.rrule) {
          // Non-recurring: shift start and end
          const newStart = new Date(new Date(ev.start).getTime() + shiftMs);
          const newEnd   = new Date(new Date(ev.end).getTime() + shiftMs);
          const updated = { ...ev, start: newStart.toISOString(), end: newEnd.toISOString() };
          const ics = serializeEvent(updated);
          const { href, etag } = await putEvent(ev.calendarId, ev.uid, ics, ev.etag);
          store.setEvent({ ...updated, href, etag });
          shifted++;
        } else if (/COUNT=|UNTIL=/i.test(ev.rrule)) {
          // Finite recurring: shift DTSTART (all occurrences move with it)
          const newStart = new Date(new Date(ev.start).getTime() + shiftMs);
          const newEnd   = new Date(new Date(ev.end).getTime() + shiftMs);
          const updated  = { ...ev, start: newStart.toISOString(), end: newEnd.toISOString() };
          const ics = serializeEvent(updated);
          const { href, etag } = await putEvent(ev.calendarId, ev.uid, ics, ev.etag);
          store.setEvent({ ...updated, href, etag });
          shifted++;
        } else {
          // Infinite recurring: add EXDATEs for occurrences within the shift window
          const dtstart = formatIcsDate(new Date(ev.start), ev.allDay);
          const rule = rrulestr(`DTSTART:${dtstart}\nRRULE:${ev.rrule}`);
          const occurrences = rule.between(now, windowEnd, true);
          if (occurrences.length === 0) { skipped++; continue; }
          const newExdates = occurrences.map(d => formatIcsDate(d, ev.allDay));
          const updated = { ...ev, exdates: [...(ev.exdates || []), ...newExdates] };
          const ics = serializeEvent(updated);
          const { href, etag } = await putEvent(ev.calendarId, ev.uid, ics, ev.etag);
          store.setEvent({ ...updated, href, etag });
          exdated++;
        }
      } catch (err) {
        errors.push({ uid: ev.uid, title: ev.title, error: err.message });
        skipped++;
      }
    }

    res.json({ ok: true, shifted, exdated, skipped, total: matching.length, errors });
  } catch (err) {
    console.error('POST /events/batch-shift:', err.message);
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
