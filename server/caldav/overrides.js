const { expandRecurring } = require('./recurrence');

// A recurring series and its individually-edited occurrences live in one CalDAV
// resource: a master VEVENT plus one override VEVENT per edited occurrence,
// sharing a UID and told apart by RECURRENCE-ID. Expanding the master alone
// would show the occurrence at its original time *and* the override at its new
// one, so the expansion has to know which occurrences are already spoken for.

/**
 * The instant a RECURRENCE-ID points at, in ms.
 *
 * New records store it as ISO UTC (see parseRecurrenceId in parser.js), but a
 * cache file written before that stores the raw `20260819T100000Z` form, which
 * Date.parse rejects — so both are accepted here.
 * @param {string|null|undefined} recurrenceId
 * @returns {number|null}
 */
function recurrenceInstant(recurrenceId) {
  if (!recurrenceId) return null;
  const iso = Date.parse(recurrenceId);
  if (!Number.isNaN(iso)) return iso;
  const m = String(recurrenceId).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(+y, +mo - 1, +d, +(h || 0), +(mi || 0), +(s || 0));
}

/**
 * Group override records by the series they belong to.
 * @param {Array<object>} overrides - records carrying a recurrenceId
 * @returns {Map<string, Map<number, object>>} uid → (replaced instant → override)
 */
function indexOverrides(overrides) {
  /** @type {Map<string, Map<number, object>>} */
  const byUid = new Map();
  for (const ov of overrides) {
    const at = recurrenceInstant(ov.recurrenceId);
    if (at === null) continue;
    let forSeries = byUid.get(ov.uid);
    if (!forSeries) {
      forSeries = new Map();
      byUid.set(ov.uid, forSeries);
    }
    forSeries.set(at, ov);
  }
  return byUid;
}

/**
 * Expand one series across [from, to], dropping the occurrences that overrides
 * replace. The overrides themselves are emitted by emitOverrides, keyed off
 * their own start — an override may move its occurrence to another day, or out
 * of the window entirely.
 * @param {object} base - the master event (has rrule, no recurrenceId)
 * @param {Map<number, object>|undefined} seriesOverrides
 * @param {Date} from
 * @param {Date} to
 * @returns {Array<object>}
 */
function expandSeries(base, seriesOverrides, from, to) {
  const occurrences = expandRecurring(base, from, to);
  if (!seriesOverrides || seriesOverrides.size === 0) return occurrences;
  const kept = [];
  for (const occ of occurrences) {
    // Match on the instant the occurrence *would* have happened, which is what
    // RECURRENCE-ID names — never on the override's replacement start.
    if (seriesOverrides.has(new Date(occ.occurrenceDate).getTime())) continue;
    kept.push(occ);
  }
  return kept;
}

/**
 * The override records that fall inside [from, to], carrying the series' own
 * recurring metadata so the client still treats them as part of the series.
 * @param {Array<object>} overrides
 * @param {Date} from
 * @param {Date} to
 * @returns {Array<object>}
 */
function emitOverrides(overrides, from, to) {
  const result = [];
  for (const ov of overrides) {
    if (!(new Date(ov.start) < to && new Date(ov.end) > from)) continue;
    result.push({
      ...ov,
      id: `${ov.uid}_${ov.recurrenceId}`,
      recurring: true,
      occurrenceDate: ov.start,
    });
  }
  return result;
}

module.exports = { recurrenceInstant, indexOverrides, expandSeries, emitOverrides };
