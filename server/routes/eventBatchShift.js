const { Router } = require('express');
const { deleteEvent } = require('../caldav/client');
const { splitSeries } = require('../caldav/recurrence');
const { currentOverrides, writeSeries } = require('../caldav/seriesResource');
const { shiftTimes, shiftSeries, seriesHead, seriesTail } = require('../caldav/seriesShift');
const store = require('../cache/store');
const config = require('../config');

// Move every event in a category by whole days, optionally only from an anchor
// date on. A series moves as one resource, master and overrides together,
// through writeSeries. An override is never written on its own: it shares the
// series' resource, so a PUT of it alone would replace the master and every
// other override.

const router = Router();

router.post('/events/batch-shift', async function batchShift(req, res) {
  try {
    const { category, shiftDays, anchorDate } = req.body;
    if (!category || !shiftDays)
      return res.status(400).json({ error: 'category and shiftDays required' });

    const days = Math.round(shiftDays);
    const anchor = anchorDate ? new Date(anchorDate) : null;
    const matching = eventsInCategory(category);

    let shifted = 0;
    let skipped = 0;
    const errors = [];
    for (const ev of matching) {
      try {
        let moved;
        if (ev.rrule) moved = await shiftRecurring(ev, days, anchor);
        else moved = await shiftSingle(ev, days, anchor);
        if (moved) shifted++;
        else skipped++;
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

/**
 * Standalone events and series masters tagged `category`. A series is matched
 * on its master's categories, and its overrides move with it.
 * @param {string} category
 * @returns {Array<object>}
 */
function eventsInCategory(category) {
  const wanted = category.toLowerCase();
  const matching = [];
  for (const ev of store.getAllEvents()) {
    if (ev.recurrenceId) continue;
    for (const c of ev.categories || []) {
      if (c.toLowerCase() === wanted) {
        matching.push(ev);
        break;
      }
    }
  }
  return matching;
}

/**
 * @param {object} ev - a non-recurring event
 * @param {number} days
 * @param {Date|null} anchor
 * @returns {Promise<boolean>} whether it moved
 */
async function shiftSingle(ev, days, anchor) {
  if (anchor && new Date(ev.start) < anchor) return false;
  // A UTC time still moves on the user's clock, so 10:00 stays 10:00 locally
  // when the shift crosses a DST change.
  let zone = null;
  if (!ev.allDay) zone = ev.zone || config.app.timezone;
  await writeSeries(shiftTimes(ev, days, zone), [], ev);
  return true;
}

/**
 * Move a series, or with an anchor only its occurrences from the anchor on.
 * The latter splits it: the occurrences before stay, capped, and the rest
 * become a new series that is moved.
 * @param {object} base - the master event
 * @param {number} days
 * @param {Date|null} anchor
 * @returns {Promise<boolean>} whether anything moved
 */
async function shiftRecurring(base, days, anchor) {
  const overrides = currentOverrides(base);
  if (anchor) {
    const { first, before } = splitSeries(base, anchor);
    if (!first) return false;
    if (before > 0) {
      await splitAndShift(base, overrides, first, before, days);
      return true;
    }
  }
  const moved = shiftSeries(base, overrides, days);
  await writeSeries(moved.base, moved.overrides, base);
  return true;
}

/**
 * @param {object} base
 * @param {Array<object>} overrides
 * @param {Date} split - first occurrence at or after the anchor
 * @param {number} before - occurrences before it
 * @param {number} days
 */
async function splitAndShift(base, overrides, split, before, days) {
  const tail = seriesTail(base, overrides, split, before, crypto.randomUUID());
  const movedTail = shiftSeries(tail.base, tail.overrides, days);
  // The new series is written first, so a refused write leaves the old one
  // whole instead of capped with nothing after it.
  const written = await writeSeries(movedTail.base, movedTail.overrides);
  const head = seriesHead(base, overrides, split);
  try {
    await writeSeries(head.base, head.overrides, base);
  } catch (seriesError) {
    try {
      await deleteEvent(written.base.href, written.base.etag);
      store.removeEventsByHrefSilent(written.base.href);
      store.flushToDisk();
    } catch (rollbackError) {
      throw new Error(
        `Series split left a shifted copy after rollback failed: ${seriesError.message}; ${rollbackError.message}`,
        { cause: rollbackError },
      );
    }
    throw seriesError;
  }
}

module.exports = router;
