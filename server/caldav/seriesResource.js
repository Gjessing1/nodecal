const { putEvent, putEventAtHref } = require('./client');
const { serializeEvents } = require('./parser');
const store = require('../cache/store');

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
 * @returns {Promise<{base: object, overrides: Array<object>}>}
 */
async function writeSeries(base, overrides) {
  const ics = serializeEvents([base, ...overrides]);
  const { href, etag } = base.href
    ? await putEventAtHref(base.href, ics, base.etag)
    : await putEvent(base.calendarId, base.uid, ics, base.etag);

  // Stamped like every other write path so syncIncremental's overwrite guard
  // can tell these from a stale remote copy.
  const now = new Date().toISOString();
  function stamp(ev) {
    return { ...ev, href, etag, localModifiedAt: now, lastSyncedAt: now };
  }

  const storedBase = stamp(base);
  const storedOverrides = overrides.map(stamp);
  if (base.href) store.removeEventsByHrefSilent(base.href);
  store.removeEventSilent(store.eventKey(base));
  for (const ov of currentOverrides(base)) store.removeEventSilent(store.eventKey(ov));
  store.setEventSilent(storedBase);
  for (const ov of storedOverrides) store.setEventSilent(ov);
  store.flushToDisk();
  return { base: storedBase, overrides: storedOverrides };
}

module.exports = { currentOverrides, writeSeries };
