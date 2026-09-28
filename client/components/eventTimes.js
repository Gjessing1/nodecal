// Date arithmetic behind the event editor's From/To fields. DOM-free so the
// node test runner can import it (see test/event-times.test.js).
//
// The fields hold wall-clock values ('YYYY-MM-DD' + 'HH:MM') in the configured
// zone. Arithmetic on them treats that wall clock as if it were UTC: the moved
// end field then shifts by exactly as much as the start field did, and neither
// the browser's own zone nor a DST change in between can nudge it by an hour or
// push it onto a different day.

const DAY_MS = 86400000;

/**
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {string} [timeStr] - 'HH:MM'
 * @returns {number}
 */
function wallClockMs(dateStr, timeStr = '00:00') {
  return Date.parse(`${dateStr}T${timeStr}:00Z`);
}

/**
 * @param {number} ms
 * @returns {{ date: string, time: string }}
 */
function fromWallClockMs(ms) {
  const iso = new Date(ms).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * Move the end field by the same wall-clock delta the start field just moved,
 * keeping the event's length — including an end that falls past midnight.
 * @param {{ date: string, time: string }} prevStart
 * @param {{ date: string, time: string }} nextStart
 * @param {{ date: string, time: string }} end
 * @returns {{ date: string, time: string }}
 */
export function shiftEndWithStart(prevStart, nextStart, end) {
  const delta =
    wallClockMs(nextStart.date, nextStart.time) - wallClockMs(prevStart.date, prevStart.time);
  return fromWallClockMs(wallClockMs(end.date, end.time) + delta);
}

/**
 * A wall-clock value moved forward by a number of minutes, rolling over midnight.
 * @param {{ date: string, time: string }} value
 * @param {number} minutes
 * @returns {{ date: string, time: string }}
 */
export function addMinutes(value, minutes) {
  return fromWallClockMs(wallClockMs(value.date, value.time) + minutes * 60000);
}

/**
 * Add whole days to a 'YYYY-MM-DD' date string.
 * @param {string} dateStr
 * @param {number} days
 */
export function addDays(dateStr, days) {
  return fromWallClockMs(wallClockMs(dateStr) + days * DAY_MS).date;
}

/**
 * The last day an all-day event covers, for the editor's "To" field. The stored
 * end is DTEND, which is exclusive: a 3-day event starting the 10th ends the 13th.
 * @param {string} startIso - UTC-midnight ISO start
 * @param {string} endIso - UTC-midnight ISO exclusive end
 * @returns {string} 'YYYY-MM-DD', never before the start date
 */
export function allDayLastDay(startIso, endIso) {
  const startDate = startIso.slice(0, 10);
  const last = addDays(endIso.slice(0, 10), -1);
  if (last < startDate) return startDate;
  return last;
}

/**
 * Build the stored range of an all-day event from the editor's inclusive dates.
 * @param {string} startDate - 'YYYY-MM-DD'
 * @param {string} lastDate - 'YYYY-MM-DD', inclusive
 * @returns {{ start: Date, end: Date }} UTC midnights, end exclusive
 */
export function allDayRange(startDate, lastDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  let endDate = addDays(lastDate, 1);
  if (lastDate < startDate) endDate = addDays(startDate, 1);
  return { start, end: new Date(`${endDate}T00:00:00Z`) };
}

/**
 * The last day an all-day event should cover when a timed event is switched to
 * all-day. An end at exactly midnight does not touch the day it opens, so
 * 22:00–00:00 stays a one-day event.
 * @param {string} startDate
 * @param {string} endDate
 * @param {string} endTime - 'HH:MM'
 */
export function lastDayOfTimedRange(startDate, endDate, endTime) {
  if (endDate <= startDate) return startDate;
  if (endTime === '00:00') return addDays(endDate, -1);
  return endDate;
}

/**
 * End of an event parsed from natural language. The parser reports whether the
 * phrase named an end ("14-16", "until 3pm"); when it did not, a timed event
 * gets the configured default length rather than the parser's fixed hour.
 * @param {{ start: string, end: string, allDay?: boolean, explicitEnd?: boolean }} parsed
 * @param {number} [durationMinutes] - state.config.defaultEventDuration
 * @returns {string} ISO end
 */
export function nlpEventEnd(parsed, durationMinutes) {
  if (parsed.allDay || parsed.explicitEnd) return parsed.end;
  const minutes = durationMinutes || 60;
  return new Date(Date.parse(parsed.start) + minutes * 60000).toISOString();
}
