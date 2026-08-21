import { localDateStr, localToUTC, toDateInputValue } from '../app/utils.js';

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
 * On the selected day being today, the form opens at the next quarter hour
 * instead of at the configured default time — the user is far more likely to be
 * adding something for later today than for 09:00 that has already passed.
 *
 * @param {Date} dayLabel - the selected day, as a label
 * @param {string} tz - configured IANA timezone
 * @param {string} [defaultEventTime] - 'HH:MM' for a day other than today
 * @param {Date} [now] - injectable for tests
 * @returns {Date}
 */
export function computeDefaultStart(dayLabel, tz, defaultEventTime, now = new Date()) {
  const dateStr = localDateStr(dayLabel);
  if (dateStr === toDateInputValue(now, tz)) {
    const quarterHour = 15 * 60000;
    return new Date(Math.ceil(now.getTime() / quarterHour) * quarterHour);
  }
  return localToUTC(dateStr, defaultEventTime || '09:00', tz);
}
