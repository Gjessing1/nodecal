const { Router } = require('express');
const { RRule } = require('rrule');
const { putEvent, putEventAtHref, deleteEvent } = require('../caldav/client');
const { serializeEvent, formatIcsDate } = require('../caldav/parser');
const { expandRecurring, setRruleUntil, parseExdate, rrulestr } = require('../caldav/recurrence');
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
    uid: newUid,
    calendarId: base.calendarId,
    allDay: base.allDay,
    rrule: base.rrule, // fallback to original rule; overridden below if user changed it
    ...filterChanges(changes),
  };
  const newIcs = serializeEvent(newEvent);
  const { href: nHref, etag: nEtag } = await putEvent(base.calendarId, newUid, newIcs);
  const stored = { ...newEvent, href: nHref, etag: nEtag, localModifiedAt: now, lastSyncedAt: now };
  store.setEvent(stored);
  res.status(201).json(toApiShape(stored));
}

// ── Helpers ───────────────────────────────────────────────

function filterChanges(changes) {
  const allowed = ['title', 'start', 'end', 'allDay', 'description', 'location', 'url', 'rrule', 'alarmMinutes', 'categories'];
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
    const { category, shiftDays, anchorDate } = req.body;
    if (!category || !shiftDays) return res.status(400).json({ error: 'category and shiftDays required' });

    const shiftMs   = Math.round(shiftDays) * 86400000;
    const anchor    = anchorDate ? new Date(anchorDate) : null;
    const catLower  = category.toLowerCase();
    const matching  = store.getAllEvents().filter(ev =>
      (ev.categories || []).some(c => c.toLowerCase() === catLower)
    );

    let shifted = 0, skipped = 0;
    const errors = [];

    for (const ev of matching) {
      try {
        const evStart = new Date(ev.start);
        const durMs   = new Date(ev.end) - evStart;

        // ── "Shift all" mode (no anchor) ────────────────────
        if (!anchor) {
          const updated = {
            ...ev,
            start: new Date(evStart.getTime() + shiftMs).toISOString(),
            end:   new Date(evStart.getTime() + durMs + shiftMs).toISOString(),
            ...(ev.rrule ? { exdates: null } : {}),
          };
          const { href, etag } = await putEventAtHref(ev.href, serializeEvent(updated), ev.etag);
          store.setEvent({ ...updated, href, etag });
          shifted++;
          continue;
        }

        // ── "Shift future" mode (anchor present) ────────────
        if (!ev.rrule) {
          // Non-recurring: skip events that ended before anchor
          if (evStart < anchor) { skipped++; continue; }
          const updated = {
            ...ev,
            start: new Date(evStart.getTime() + shiftMs).toISOString(),
            end:   new Date(evStart.getTime() + durMs + shiftMs).toISOString(),
          };
          const { href, etag } = await putEventAtHref(ev.href, serializeEvent(updated), ev.etag);
          store.setEvent({ ...updated, href, etag });
          shifted++;
          continue;
        }

        // Recurring: find split point using rrule library
        const dtstart = formatIcsDate(evStart, false);
        const rule    = rrulestr(`DTSTART:${dtstart}\nRRULE:${ev.rrule}`);
        const lastBefore    = rule.before(anchor, false); // last occurrence strictly before anchor
        const firstAtOrAfter = rule.after(anchor, true);  // first occurrence at or after anchor

        if (!firstAtOrAfter) { skipped++; continue; } // series already ended before anchor

        if (!lastBefore || evStart >= anchor) {
          // Entire series is at or after anchor — just shift DTSTART
          const newStart = new Date(firstAtOrAfter.getTime() + shiftMs);
          const updated  = { ...ev, start: newStart.toISOString(), end: new Date(newStart.getTime() + durMs).toISOString(), exdates: null };
          const { href, etag } = await putEventAtHref(ev.href, serializeEvent(updated), ev.etag);
          store.setEvent({ ...updated, href, etag });
          shifted++;
          continue;
        }

        // Split: cap history series, create new shifted series
        const cappedRrule  = setRruleUntil(ev.rrule, lastBefore, ev.allDay);
        const cappedBase   = { ...ev, rrule: cappedRrule };
        const { href: bHref, etag: bEtag } = await putEventAtHref(ev.href, serializeEvent(cappedBase), ev.etag);
        store.setEvent({ ...cappedBase, href: bHref, etag: bEtag });

        const newUid   = crypto.randomUUID();
        const newStart = new Date(firstAtOrAfter.getTime() + shiftMs);
        const openRrule = ev.rrule.replace(/;?(UNTIL|COUNT)=[^;]*/gi, '').replace(/^;|;$/g, '');
        const newSeries = { ...ev, uid: newUid, start: newStart.toISOString(), end: new Date(newStart.getTime() + durMs).toISOString(), rrule: openRrule, exdates: null };
        const { href: nHref, etag: nEtag } = await putEvent(ev.calendarId, newUid, serializeEvent(newSeries));
        store.setEvent({ ...newSeries, href: nHref, etag: nEtag });
        shifted++;

      } catch (err) {
        console.error(`[batch-shift] skipped "${ev.title}" (${ev.uid}): ${err.message}`);
        errors.push({ uid: ev.uid, title: ev.title, error: err.message });
        skipped++;
      }
    }

    res.json({ ok: true, shifted, skipped, total: matching.length, errors });
  } catch (err) {
    console.error('POST /events/batch-shift:', err.message);
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
