import { localDateStr } from '../app/utils.js';

// Where a multi-day event sits on a run of consecutive days, and how several of
// them stack without ever sharing a cell. The week all-day row needs the lanes;
// the month grid only needs to know which end of the run each cell is.
//
// Everything here works in YYYY-MM-DD strings on the local calendar. All-day
// events are stored at UTC midnight, so their dates are read straight off the
// ISO string — new Date() would shift them a day by the browser offset.

const MS_PER_DAY = 86400000;

/**
 * @typedef {object} EventSpan
 * @property {any} event
 * @property {number} startIdx - first covered day index in the run
 * @property {number} endIdx - last covered day index, inclusive
 * @property {boolean} continuesBefore - the event starts before the run
 * @property {boolean} continuesAfter - the event ends after the run
 * @property {number} lane - stacking row, filled in by layoutSpans
 */

/**
 * Midnight of a YYYY-MM-DD string on the UTC clock. Only ever used to count
 * whole days between two such strings, which keeps the arithmetic DST-free.
 * @param {string} dateStr
 */
function utcMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Whole days from `fromStr` to `toStr`, negative when `toStr` is earlier.
 * @param {string} fromStr - YYYY-MM-DD
 * @param {string} toStr - YYYY-MM-DD
 */
export function dayDiff(fromStr, toStr) {
  return Math.round((utcMidnight(toStr) - utcMidnight(fromStr)) / MS_PER_DAY);
}

/**
 * `dateStr` shifted by `n` days.
 * @param {string} dateStr - YYYY-MM-DD
 * @param {number} n
 */
function addDays(dateStr, n) {
  return new Date(utcMidnight(dateStr) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * The first and last local day an event paints on, both inclusive.
 * @param {any} ev
 * @returns {{ startStr: string, endStr: string }}
 */
export function eventDayRange(ev) {
  let startStr, endStr;
  if (ev.allDay) {
    startStr = ev.start.slice(0, 10);
    // All-day ends are exclusive: an event ending on the 4th paints through the 3rd.
    endStr = addDays((ev.end || ev.start).slice(0, 10), -1);
  } else {
    startStr = localDateStr(new Date(ev.start));
    // An event ending exactly at midnight belongs to the day before, so step
    // back a millisecond before reading the end's local date.
    endStr = localDateStr(new Date(new Date(ev.end || ev.start).getTime() - 1));
  }
  if (endStr < startStr) endStr = startStr;
  return { startStr, endStr };
}

/**
 * Which end of its run a given day is, for squaring off the inner corners.
 * @param {{ startStr: string, endStr: string }} range
 * @param {string} dayStr - YYYY-MM-DD, local
 * @returns {'single' | 'start' | 'middle' | 'end'}
 */
export function spanPosition(range, dayStr) {
  const isStart = range.startStr === dayStr;
  const isEnd = range.endStr === dayStr;
  if (isStart && isEnd) return 'single';
  if (isStart) return 'start';
  if (isEnd) return 'end';
  return 'middle';
}

/**
 * Place one event on a run of consecutive days, clamped to what is visible.
 * @param {any} ev
 * @param {string[]} dayStrs - consecutive local YYYY-MM-DD, earliest first
 * @returns {EventSpan | null} null when the event misses the run entirely
 */
export function spanForDays(ev, dayStrs) {
  const range = eventDayRange(ev);
  const last = dayStrs.length - 1;
  const rawStart = dayDiff(dayStrs[0], range.startStr);
  const rawEnd = dayDiff(dayStrs[0], range.endStr);
  if (rawEnd < 0 || rawStart > last) return null;
  return {
    event: ev,
    startIdx: Math.max(0, rawStart),
    endIdx: Math.min(last, rawEnd),
    continuesBefore: rawStart < 0,
    continuesAfter: rawEnd > last,
    lane: 0,
  };
}

/**
 * Order spans left to right, longest first where they start together, so the
 * bar that crosses the most days takes the top lane.
 * @param {EventSpan} a
 * @param {EventSpan} b
 */
function compareSpans(a, b) {
  if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx;
  const aLen = a.endIdx - a.startIdx;
  const bLen = b.endIdx - b.startIdx;
  if (aLen !== bLen) return bLen - aLen;
  return String(a.event.title || '').localeCompare(String(b.event.title || ''));
}

/**
 * Stack the events into lanes so no two bars overlap a day.
 * @param {any[]} events
 * @param {string[]} dayStrs - consecutive local YYYY-MM-DD, earliest first
 * @returns {EventSpan[]} ordered by lane, then by start day
 */
export function layoutSpans(events, dayStrs) {
  const spans = [];
  for (const ev of events) {
    const span = spanForDays(ev, dayStrs);
    if (span) spans.push(span);
  }
  spans.sort(compareSpans);

  // Spans are sorted by start day, so a lane is free as soon as the last bar
  // parked in it has ended.
  const laneEnds = [];
  for (const span of spans) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= span.startIdx) lane++;
    laneEnds[lane] = span.endIdx;
    span.lane = lane;
  }
  return spans;
}
