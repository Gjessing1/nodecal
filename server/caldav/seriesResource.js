const { putEvent, putEventAtHref, deleteEvent } = require('./client');
const { relocateEvent } = require('./relocate');
const { serializeEvents, writtenLines } = require('./vevent');
const { seriesHead } = require('./seriesShift');
const store = require('../cache/store');
const config = require('../config');

// One CalDAV resource holds a whole series — the master plus every override —
// so a change to any of them is a rewrite of all of them. Doing that in one
// place keeps the cache and the server from drifting apart: the records for the
// resource are cleared and re-seeded together, which is also what removes an
// override the user just deleted.

/**
 * The override records currently stored for a series.
 *
 * Looked up by UID rather than href because a PUT rewrites href into its
 * absolute form, so the two can disagree for a record written before the last
 * sync normalised it.
 * @param {object} base - the master event
 * @returns {Array<object>}
 */
function currentOverrides(base) {
  return store.getOverrides().filter(matchesSeries);

  function matchesSeries(ov) {
    return ov.uid === base.uid;
  }
}

/**
 * Write the master and its overrides as one resource, then replace the cached
 * records for it.
 * @param {object} base - the master event, with any EXDATE edits already applied
 * @param {Array<object>} overrides - the overrides that survive the change
 * @param {object} [source=base] - record before editing, used when the series moves calendars
 * @returns {Promise<{base: object, overrides: Array<object>}>}
 */
async function writeSeries(base, overrides, source = base) {
  const ics = serializeEvents([base, ...overrides], { timezone: config.app.timezone });
  let written;
  if (source.calendarId !== base.calendarId) {
    written = await relocateEvent(source, base, ics);
  } else if (source.href) {
    written = await putEventAtHref(source.href, ics, source.etag);
  } else {
    written = await putEvent(base.calendarId, base.uid, ics, base.etag);
  }
  const { href, etag } = written;

  // Stamped like every other write path so syncIncremental's overwrite guard
  // can tell these from a stale remote copy. Each record takes the lines it was
  // just written as; serializeEvents keeps the order it was given.
  const now = new Date().toISOString();
  const lines = writtenLines(ics, { timezone: config.app.timezone });
  function stamp(ev, index) {
    return {
      ...ev,
      ...lines[index],
      calendarId: base.calendarId,
      href,
      etag,
      localModifiedAt: now,
      lastSyncedAt: now,
    };
  }

  const storedBase = stamp(base, 0);
  const storedOverrides = [];
  for (let i = 0; i < overrides.length; i++) storedOverrides.push(stamp(overrides[i], i + 1));
  if (source.href) store.removeEventsByHrefSilent(source.href);
  store.removeEventSilent(store.eventKey(base));
  for (const ov of currentOverrides(base)) store.removeEventSilent(store.eventKey(ov));
  store.setEventSilent(storedBase);
  for (const ov of storedOverrides) store.setEventSilent(ov);
  store.flushToDisk();
  return { base: storedBase, overrides: storedOverrides };
}

/**
 * Split a series in two: write `tail` as a new resource, then cap the original
 * to end before `split`. The new series goes first, so a refused write leaves
 * the old one whole instead of capped with nothing after it; if capping fails,
 * the new series is deleted again.
 * @param {object} base - the master event
 * @param {Array<object>} overrides - its current overrides
 * @param {Date} split - the first occurrence that moves to `tail`
 * @param {{ base: object, overrides: Array<object> }} tail - see seriesTail
 * @returns {Promise<{base: object, overrides: Array<object>}>} the new series as stored
 */
async function writeSplit(base, overrides, split, tail) {
  const written = await writeSeries(tail.base, tail.overrides);
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
        `Series split left a copy after rollback failed: ${seriesError.message}; ${rollbackError.message}`,
        { cause: rollbackError },
      );
    }
    throw seriesError;
  }
  return written;
}

module.exports = { currentOverrides, writeSeries, writeSplit };
