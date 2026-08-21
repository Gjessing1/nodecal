import { localDateStr, localToUTC, toDateInputValue } from './utils.js';

// A day column in the time grids is 24 hours of wall clock in the *configured*
// timezone — that is the zone timeGrid.timeToTop positions every block, the
// now-line and the auto-scroll offset in. The window that decides which events
// land in the column therefore has to be built in the same zone, or the two
// halves of the calculation disagree: bucket in the browser's zone and an event
// is filed under one day but drawn at another day's height.
//
// The Date objects the views pass around for a day are *labels*, not instants —
// browser-local midnight, read back with localDateStr, and combined with a wall
// clock time through localToUTC when something is written. That convention is
// now spelled out here rather than left implicit: labelForDateStr builds one,
// shiftLabel moves one, todayLabel names today's. Everything that has to know
// *which real day it is* — the clipping window, "is this today?", and the label
// a "go to today" action selects — reads the configured zone.

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
 * The label Date for a calendar date: browser-local midnight, which is the form
 * every view passes around and `localDateStr` reads back.
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @returns {Date}
 */
export function labelForDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The label for today's date in `timezone` — what every "go to today" action
 * should select.
 *
 * `new Date()` is an *instant*; storing it in `state.selectedDate`, which is a
 * label, means the views read back the *browser's* date. Near midnight in a
 * divergent zone that is the day next to the one the grid has just marked
 * today, so "Today" lands beside today.
 * @param {string} timezone
 * @returns {Date}
 */
export function todayLabel(timezone = 'UTC') {
  return labelForDateStr(todayStr(timezone));
}

/**
 * A day label moved by whole days.
 *
 * Adding `days * 86400000` to a label is wrong on the *browser's* own DST
 * boundary: local midnight plus 24h is 23:00 on the same date when the clocks
 * go back, so the next-day arrow appears to do nothing. Shifting the date
 * string instead keeps a day a day.
 * @param {Date} label
 * @param {number} days
 * @returns {Date}
 */
export function shiftLabel(label, days) {
  return labelForDateStr(shiftDateStr(localDateStr(label), days));
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
