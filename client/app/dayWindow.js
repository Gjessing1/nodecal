import { localToUTC, toDateInputValue } from './utils.js';

// A day column in the time grids is 24 hours of wall clock in the *configured*
// timezone — that is the zone timeGrid.timeToTop positions every block, the
// now-line and the auto-scroll offset in. The window that decides which events
// land in the column therefore has to be built in the same zone, or the two
// halves of the calculation disagree: bucket in the browser's zone and an event
// is filed under one day but drawn at another day's height.
//
// The Date objects the views pass around for a day are *labels*, not instants —
// browser-local midnight, read back with localDateStr, and combined with a wall
// clock time through localToUTC when something is written. Those stay as they
// are. Only the clipping window and "is this today?" move into the configured
// zone, which is where the divergence was visible.

/**
 * The instants that open and close a calendar date in a given timezone.
 *
 * Each boundary is resolved from its own date string rather than by adding 24h
 * to the first, so a DST day is genuinely 23 or 25 hours long.
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {string} timezone - IANA timezone
 * @returns {{ start: Date, end: Date }}
 */
export function dayWindow(dateStr, timezone = 'UTC') {
  return {
    start: localToUTC(dateStr, '00:00', timezone),
    end: localToUTC(shiftDateStr(dateStr, 1), '00:00', timezone),
  };
}

/**
 * A wall-clock time on a calendar date, as the instant it names in `timezone`.
 *
 * Views used to build these by adding minutes to a local-midnight Date. That is
 * the browser's midnight, and it drifts by an hour over a DST boundary; naming
 * the clock time directly does neither.
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {number} minutes - minutes past midnight, wall clock
 * @param {string} timezone
 * @returns {Date}
 */
export function timeOnDay(dateStr, minutes, timezone = 'UTC') {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return localToUTC(dateStr, `${h}:${m}`, timezone);
}

/**
 * Today's calendar date in the configured zone, as 'YYYY-MM-DD'.
 *
 * Compare day labels against this rather than against `new Date()` — near
 * midnight the browser and the configured zone are on different dates, and the
 * grid would mark one column "today" while drawing the now-line in another.
 * @param {string} timezone
 * @returns {string}
 */
export function todayStr(timezone = 'UTC') {
  return toDateInputValue(new Date(), timezone);
}

/**
 * `dateStr` moved by whole days, in UTC arithmetic so no DST offset applies.
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {number} days
 * @returns {string}
 */
export function shiftDateStr(dateStr, days) {
  const at = new Date(`${dateStr}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
