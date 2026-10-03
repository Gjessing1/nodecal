const { Router } = require('express');
const { putEvent, putEventAtHref, deleteEvent } = require('../caldav/client');
const { formatIcsDate } = require('../caldav/parser');
const { serializeEvent: serializeWithZone, writtenLines } = require('../caldav/vevent');
const { setRruleUntil, rrulestr } = require('../caldav/recurrence');
const { indexOverrides, expandSeries, emitOverrides } = require('../caldav/overrides');
const {
  overrideAt,
  buildOverride,
  mergeOverride,
  withoutOverride,
  overridesBefore,
  withExdate,
} = require('../caldav/exceptions');
const { currentOverrides, writeSeries } = require('../caldav/seriesResource');
const { relocateEvent } = require('../caldav/relocate');
const store = require('../cache/store');
const config = require('../config');

const router = Router();

/**
 * @param {object} event
 * @returns {string}
 */
function serializeEvent(event) {
  return serializeWithZone(event, { timezone: config.app.timezone });
}

/**
 * The cache record for an event just written. It carries the lines the server
 * now holds, so the next edit compares against this write, not the one before.
 * @param {object} event
 * @param {string} ics - what was PUT
 * @param {{ href: string, etag: string }} written
 * @param {string} now - ISO
 */
function writtenRecord(event, ics, written, now) {
  return {
    ...event,
    ...writtenLines(ics)[0],
    href: written.href,
    etag: written.etag,
    localModifiedAt: now,
    lastSyncedAt: now,
  };
}

// ── GET /events ───────────────────────────────────────────

router.get('/events', (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
  const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 90 * 86400000);

  const result = [];
  for (const ev of store.getNonRecurringInRange(from, to)) {
    result.push(toApiShape(ev));
  }
  // Overrides replace the occurrence their RECURRENCE-ID names, so the series
  // has to be expanded knowing about them or the occurrence shows up twice —
  // once at its original time and once at the edited one.
  const overrides = store.getOverrides();
  const overridesByUid = indexOverrides(overrides);
  for (const ev of store.getRecurringBases()) {
    for (const occ of expandSeries(ev, overridesByUid.get(ev.uid), from, to)) {
      result.push(toApiShape(occ));
    }
  }
  for (const ov of emitOverrides(overrides, from, to)) {
    result.push(toApiShape(ov));
  }
  result.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  res.json(result);
});

// ── POST /events ──────────────────────────────────────────

router.post('/events', async (req, res) => {
  try {
    const {
      calendarId,
      title,
      start,
      end,
      allDay,
      description,
      location,
      url,
      rrule,
      alarmMinutes,
      categories,
    } = req.body;
    if (!calendarId || !title || !start)
      return res.status(400).json({ error: 'calendarId, title, start required' });

    const uid = crypto.randomUUID();
    const now = new Date().toISOString();
    const event = {
      uid,
      calendarId,
      title,
      start,
      end: end || start,
      allDay: !!allDay,
      description: description || '',
      location: location || '',
      url: url || '',
      rrule: rrule || null,
      alarmMinutes: alarmMinutes != null ? parseInt(alarmMinutes) : null,
      categories: Array.isArray(categories) ? categories : [],
    };
    const ics = serializeEvent(event);
    const written = await putEvent(calendarId, uid, ics);
    const stored = writtenRecord(event, ics, written, now);
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
    const { recurringScope, occurrenceDate, recurrenceId, uid: baseUid, ...changes } = req.body;

    // For recurring occurrences, the request includes uid (base UID); otherwise use :id
    const existing = store.getEvent(baseUid || req.params.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const instant = occurrenceInstant(recurrenceId, occurrenceDate);
    if (existing.rrule && recurringScope === 'single') {
      return handleSingleOccurrenceEdit(existing, changes, instant, res);
    }
    if (existing.rrule && recurringScope === 'future') {
      return handleFutureEdit(existing, changes, instant, res);
    }

    // Simple update (non-recurring, or 'all' scope on recurring base)
    const updated = { ...existing, ...filterChanges(changes) };
    if (existing.rrule) {
      const written = await writeSeries(updated, currentOverrides(existing), existing);
      return res.json(toApiShape(written.base));
    }

    const ics = serializeEvent(updated);
    let written;
    if (updated.calendarId !== existing.calendarId) {
      written = await relocateEvent(existing, updated, ics);
    } else if (existing.href) {
      written = await putEventAtHref(existing.href, ics, existing.etag);
    } else {
      written = await putEvent(existing.calendarId, existing.uid, ics, existing.etag);
    }
    const stored = writtenRecord(updated, ics, written, new Date().toISOString());
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
    const { scope, occurrenceDate, recurrenceId, uid: baseUid } = req.query;
    const existing = store.getEvent(baseUid || req.params.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const instant = occurrenceInstant(recurrenceId, occurrenceDate);
    if (existing.rrule && scope === 'single') {
      // Skip the occurrence with an EXDATE, and drop the override replacing it
      // if there was one — an EXDATE alone leaves the override standing, so the
      // occurrence the user just deleted would still be drawn at its edited time.
      const overrides = withoutOverride(currentOverrides(existing), instant);
      await writeSeries(withExdate(existing, instant), overrides);
      return res.status(204).end();
    }

    if (existing.rrule && scope === 'future') {
      // Trim the series to end just before this occurrence
      const until = new Date(new Date(instant).getTime() - 1000);
      const updated = { ...existing, rrule: setRruleUntil(existing.rrule, until) };
      await writeSeries(updated, overridesBefore(currentOverrides(existing), instant));
      return res.status(204).end();
    }

    // Delete all / non-recurring. Clearing by href rather than by UID is what
    // takes the series' overrides with it: they share the resource, and the
    // UID-keyed record is only the master.
    await deleteEvent(existing.href, existing.etag);
    if (existing.href) store.removeEventsByHrefSilent(existing.href);
    store.removeEvent(store.eventKey(existing));
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /events/:id:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Recurring helpers ─────────────────────────────────────

/**
 * "This event only" — write the occurrence as a RECURRENCE-ID override inside
 * the series' own resource.
 *
 * It used to be an EXDATE on the master plus a standalone event under a fresh
 * UID. That detached the occurrence: every other CalDAV client saw an unrelated
 * one-off rather than a modified instance, nothing tied it back to the series,
 * and editing an occurrence that another client had already overridden left the
 * old override in place beside the new copy — the same evening twice.
 * @param {object} base - the master event
 * @param {object} changes
 * @param {string} instant - ISO UTC start the occurrence would have had
 * @param {import('express').Response} res
 */
async function handleSingleOccurrenceEdit(base, changes, instant, res) {
  const overrides = currentOverrides(base);
  const filtered = filterChanges(changes);
  if (filtered.calendarId && filtered.calendarId !== base.calendarId) {
    return handleSingleOccurrenceRelocation(base, overrides, filtered, instant, res);
  }
  const override = buildOverride(base, overrideAt(overrides, instant), filtered, instant);
  const written = await writeSeries(base, mergeOverride(overrides, override));
  const stored = written.overrides.find(replacesThisOccurrence) || override;
  res.status(201).json(toApiShape({ ...stored, ...occurrenceIdentity(stored) }));

  function replacesThisOccurrence(ov) {
    return ov.recurrenceId === instant;
  }
}

/**
 * A recurrence override cannot live in a different CalDAV collection from its
 * master. Moving one occurrence therefore detaches it under a fresh UID and
 * adds an EXDATE to the source series. The copy is created first and rolled
 * back if rewriting the source series fails, so a failed move cannot lose the
 * occurrence.
 */
async function handleSingleOccurrenceRelocation(base, overrides, changes, instant, res) {
  const uid = crypto.randomUUID();
  const detached = {
    ...base,
    ...changes,
    uid,
    rrule: null,
    recurrenceId: null,
    exdates: null,
  };
  delete detached.id;
  delete detached.href;
  delete detached.etag;
  delete detached.recurring;
  delete detached.occurrenceDate;

  const ics = serializeEvent(detached);
  const written = await putEvent(detached.calendarId, uid, ics);
  try {
    await writeSeries(withExdate(base, instant), withoutOverride(overrides, instant));
  } catch (seriesError) {
    try {
      await deleteEvent(written.href, written.etag);
    } catch (rollbackError) {
      throw new Error(
        `Occurrence move left a destination copy after rollback failed: ${seriesError.message}; ${rollbackError.message}`,
        { cause: rollbackError },
      );
    }
    throw seriesError;
  }

  const stored = writtenRecord(detached, ics, written, new Date().toISOString());
  store.setEvent(stored);
  res.status(201).json(toApiShape(stored));
}

/**
 * "This and following" — cap the old series and start a new one here.
 * @param {object} base - the master event
 * @param {object} changes
 * @param {string} instant - ISO UTC start the occurrence would have had
 * @param {import('express').Response} res
 */
async function handleFutureEdit(base, changes, instant, res) {
  // Build and create the new series before trimming the old one. If the target
  // calendar rejects it, the original recurrence remains completely intact.
  const newUid = crypto.randomUUID();
  const newEvent = {
    uid: newUid,
    calendarId: base.calendarId,
    allDay: base.allDay,
    rrule: base.rrule,
    ...filterChanges(changes),
  };
  const newIcs = serializeEvent(newEvent);
  const written = await putEvent(newEvent.calendarId, newUid, newIcs);

  // Trim the base series UNTIL to just before this occurrence. Overrides at or
  // after the split go with it: they replace occurrences the trimmed series no
  // longer has, and the new series covers those dates.
  const until = new Date(new Date(instant).getTime() - 1000);
  const updatedBase = { ...base, rrule: setRruleUntil(base.rrule, until) };
  try {
    await writeSeries(updatedBase, overridesBefore(currentOverrides(base), instant));
  } catch (seriesError) {
    try {
      await deleteEvent(written.href, written.etag);
    } catch (rollbackError) {
      throw new Error(
        `Series split left a destination copy after rollback failed: ${seriesError.message}; ${rollbackError.message}`,
        { cause: rollbackError },
      );
    }
    throw seriesError;
  }

  const stored = writtenRecord(newEvent, newIcs, written, new Date().toISOString());
  store.setEvent(stored);
  res.status(201).json(toApiShape(stored));
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Which occurrence of a series a request is aimed at, as an ISO UTC instant.
 *
 * RECURRENCE-ID is what identifies an occurrence, and for one that has already
 * been edited it is the only thing that does: `occurrenceDate` there is the
 * override's *new* start, which may be another day entirely. Occurrences that
 * have never been edited have no recurrenceId and their start is the instant.
 * @param {string|undefined|null} recurrenceId
 * @param {string|undefined|null} occurrenceDate
 * @returns {string}
 */
function occurrenceInstant(recurrenceId, occurrenceDate) {
  return recurrenceId || occurrenceDate;
}

/**
 * The id/occurrenceDate an override is served under, so a just-written one
 * matches what the next GET /events emits for it (see emitOverrides).
 * @param {object} override
 */
function occurrenceIdentity(override) {
  return {
    id: `${override.uid}_${override.recurrenceId}`,
    recurring: true,
    occurrenceDate: override.start,
  };
}

function filterChanges(changes) {
  const allowed = [
    'title',
    'start',
    'end',
    'allDay',
    'description',
    'location',
    'url',
    'rrule',
    'alarmMinutes',
    'categories',
    'calendarId',
  ];
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
    // Set only on an occurrence that was edited out of its series — the instant
    // it would have started at. The views use it to mark the occurrence as
    // modified, and send it back so an edit lands on the override itself.
    recurrenceId: ev.recurrenceId || null,
    alarmMinutes: ev.alarmMinutes ?? null,
  };
}

// ── POST /events/batch-shift ──────────────────────────────

router.post('/events/batch-shift', async (req, res) => {
  try {
    const { category, shiftDays, anchorDate } = req.body;
    if (!category || !shiftDays)
      return res.status(400).json({ error: 'category and shiftDays required' });

    const shiftMs = Math.round(shiftDays) * 86400000;
    // Stamped like every other write path so the sync engine can still tell a
    // locally-edited event from a stale remote one.
    const now = new Date().toISOString();
    const anchor = anchorDate ? new Date(anchorDate) : null;
    const catLower = category.toLowerCase();
    const matching = store
      .getAllEvents()
      .filter((ev) => (ev.categories || []).some((c) => c.toLowerCase() === catLower));

    let shifted = 0,
      skipped = 0;
    const errors = [];

    for (const ev of matching) {
      try {
        const evStart = new Date(ev.start);
        const durMs = new Date(ev.end).getTime() - evStart.getTime();

        // ── "Shift all" mode (no anchor) ────────────────────
        if (!anchor) {
          const updated = {
            ...ev,
            start: new Date(evStart.getTime() + shiftMs).toISOString(),
            end: new Date(evStart.getTime() + durMs + shiftMs).toISOString(),
            ...(ev.rrule ? { exdates: null } : {}),
          };
          const ics = serializeEvent(updated);
          const written = await putEventAtHref(ev.href, ics, ev.etag);
          store.setEvent(writtenRecord(updated, ics, written, now));
          shifted++;
          continue;
        }

        // ── "Shift future" mode (anchor present) ────────────
        if (!ev.rrule) {
          // Non-recurring: skip events that ended before anchor
          if (evStart < anchor) {
            skipped++;
            continue;
          }
          const updated = {
            ...ev,
            start: new Date(evStart.getTime() + shiftMs).toISOString(),
            end: new Date(evStart.getTime() + durMs + shiftMs).toISOString(),
          };
          const ics = serializeEvent(updated);
          const written = await putEventAtHref(ev.href, ics, ev.etag);
          store.setEvent(writtenRecord(updated, ics, written, now));
          shifted++;
          continue;
        }

        // Recurring: find split point using rrule library
        const dtstart = formatIcsDate(evStart, false);
        const rule = rrulestr(`DTSTART:${dtstart}\nRRULE:${ev.rrule}`);
        const lastBefore = rule.before(anchor, false); // last occurrence strictly before anchor
        const firstAtOrAfter = rule.after(anchor, true); // first occurrence at or after anchor

        if (!firstAtOrAfter) {
          skipped++;
          continue;
        } // series already ended before anchor

        if (!lastBefore || evStart >= anchor) {
          // Entire series is at or after anchor — just shift DTSTART
          const newStart = new Date(firstAtOrAfter.getTime() + shiftMs);
          const updated = {
            ...ev,
            start: newStart.toISOString(),
            end: new Date(newStart.getTime() + durMs).toISOString(),
            exdates: null,
          };
          const ics = serializeEvent(updated);
          const written = await putEventAtHref(ev.href, ics, ev.etag);
          store.setEvent(writtenRecord(updated, ics, written, now));
          shifted++;
          continue;
        }

        // Split: cap history series, create new shifted series
        const cappedRrule = setRruleUntil(ev.rrule, lastBefore, ev.allDay);
        const cappedBase = { ...ev, rrule: cappedRrule };
        const cappedIcs = serializeEvent(cappedBase);
        const cappedWritten = await putEventAtHref(ev.href, cappedIcs, ev.etag);
        store.setEvent(writtenRecord(cappedBase, cappedIcs, cappedWritten, now));

        const newUid = crypto.randomUUID();
        const newStart = new Date(firstAtOrAfter.getTime() + shiftMs);
        const openRrule = ev.rrule.replace(/;?(UNTIL|COUNT)=[^;]*/gi, '').replace(/^;|;$/g, '');
        const newSeries = {
          ...ev,
          uid: newUid,
          start: newStart.toISOString(),
          end: new Date(newStart.getTime() + durMs).toISOString(),
          rrule: openRrule,
          exdates: null,
        };
        const newIcs = serializeEvent(newSeries);
        const newWritten = await putEvent(ev.calendarId, newUid, newIcs);
        store.setEvent(writtenRecord(newSeries, newIcs, newWritten, now));
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
