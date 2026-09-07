import { localDateStr, localToUTC } from '../app/utils.js';

/**
 * The start instant a new event opens with, for the day the user has selected.
 *
 * `dayLabel` is a day *label* — browser-local midnight naming a calendar date —
 * so the date is read back with `localDateStr`. It used to be read with
 * `toDateInputValue(dayLabel, tz)`, which re-reads the label as an instant and
 * converts it into the configured zone: a browser far enough east or west of
 * that zone lands the new event on the day before or after the one the user
 * tapped. The two conventions had collided in exactly one place, and this was
 * it.
 *
 * @param {Date} dayLabel - the selected day, as a label
 * @param {string} tz - configured IANA timezone
 * @param {string} [defaultEventTime] - configured 'HH:MM' wall-clock time
 * @returns {Date}
 */
export function computeDefaultStart(dayLabel, tz, defaultEventTime) {
  const dateStr = localDateStr(dayLabel);
  return localToUTC(dateStr, defaultEventTime || '09:00', tz);
}
