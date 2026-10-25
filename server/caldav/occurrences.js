const store = require('../cache/store');
const { indexOverrides, expandSeries, emitOverrides } = require('./overrides');

/**
 * Every event occurrence in [from, to] as cache records: one-off events,
 * expanded series and the overrides that replace their edited occurrences.
 *
 * Overrides replace the occurrence their RECURRENCE-ID names, so the series has
 * to be expanded knowing about them or the occurrence shows up twice — once at
 * its original time and once at the edited one.
 *
 * One-off events and overrides count when they overlap the window; a series
 * occurrence only when it *starts* inside it (expandRecurring's rule). A caller
 * that needs running occurrences too widens `from` and filters on `end`.
 * @param {Date} from
 * @param {Date} to
 * @returns {Array<object>} unsorted
 */
function occurrencesInRange(from, to) {
  const result = [];
  for (const ev of store.getNonRecurringInRange(from, to)) result.push(ev);
  const overrides = store.getOverrides();
  const overridesByUid = indexOverrides(overrides);
  for (const ev of store.getRecurringBases()) {
    for (const occ of expandSeries(ev, overridesByUid.get(ev.uid), from, to)) result.push(occ);
  }
  for (const ov of emitOverrides(overrides, from, to)) result.push(ov);
  return result;
}

module.exports = { occurrencesInRange };
