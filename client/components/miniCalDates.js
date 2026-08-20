/** Date arithmetic for the mini-calendar grid. No DOM in here. */

export const DAY_NAMES_MONDAY = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const DAY_NAMES_SUNDAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** Arrows move a day at a time horizontally and a week at a time vertically. */
const ARROW_DELTA = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/**
 * @param {Date} a
 * @param {Date} b
 */
export function sameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

/**
 * Column `d` sits in under the configured first day of week.
 * @param {Date} d
 * @param {boolean} startOnMonday
 */
export function weekColumn(d, startOnMonday) {
  const dow = d.getDay();
  if (startOnMonday) return dow === 0 ? 6 : dow - 1;
  return dow;
}

/**
 * Same day-of-month `n` months away, clamped to that month's length so a
 * PageDown from Jan 31 lands on Feb 28 instead of skipping into March.
 * @param {Date} d
 * @param {number} n
 */
export function addMonths(d, n) {
  const year = d.getFullYear();
  const month = d.getMonth() + n;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(d.getDate(), lastDay));
}

/**
 * Where a key press should move the roving focus, or null when the key is not
 * one the grid handles.
 * @param {string} key
 * @param {Date} base - the day currently focused
 * @param {boolean} startOnMonday
 * @returns {Date|null}
 */
export function nextFocusDate(key, base, startOnMonday) {
  const delta = ARROW_DELTA[key];
  if (delta !== undefined) return shiftDays(base, delta);
  if (key === 'Home') return shiftDays(base, -weekColumn(base, startOnMonday));
  if (key === 'End') return shiftDays(base, 6 - weekColumn(base, startOnMonday));
  if (key === 'PageUp') return addMonths(base, -1);
  if (key === 'PageDown') return addMonths(base, 1);
  return null;
}

/**
 * @param {Date} d
 * @param {number} n
 */
function shiftDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
