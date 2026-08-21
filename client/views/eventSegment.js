// The part of a timed event that belongs to one day column of a time grid.
// An event running 22:00 Monday to 02:00 Tuesday is one event and two segments:
// the grid draws a block per column, so each block has to be clipped to its own
// day — otherwise Tuesday's block is drawn at Monday's clock time, four hours
// long, and reads as a second event.
//
// The window is whatever day.js and week.js hand in, and both build it in the
// configured timezone (app/dayWindow.js) — the same zone timeGrid.timeToTop
// positions the block inside the column in. Passing a browser-local window here
// is what used to file an event under one day and draw it at another day's
// height whenever TIMEZONE was not the device's zone.

/**
 * @typedef {object} EventSegment
 * @property {Date} start - where the block starts on this day
 * @property {Date} end - where it ends on this day
 * @property {boolean} continuesBefore - the event began before this day
 * @property {boolean} continuesAfter - the event runs past the end of this day
 */

/**
 * Clip a timed event to one day column.
 *
 * @param {any} ev - a timed event (all-day events belong in the all-day strip)
 * @param {Date} dayStart - the instant opening the column, in the configured zone
 * @param {Date} dayEnd - the instant closing it; not always +24h, because of DST
 * @returns {EventSegment | null} null when the event misses the day entirely
 */
export function clipEventToDay(ev, dayStart, dayEnd) {
  const startMs = new Date(ev.start).getTime();
  // A zero-length event still paints: the block builder gives it a minimum height.
  const endMs = Math.max(new Date(ev.end || ev.start).getTime(), startMs);
  const windowStart = dayStart.getTime();
  const windowEnd = dayEnd.getTime();
  // An event ending exactly at midnight belongs to the day before, not to this one.
  if (endMs <= windowStart || startMs >= windowEnd) return null;
  return {
    start: new Date(Math.max(startMs, windowStart)),
    end: new Date(Math.min(endMs, windowEnd)),
    continuesBefore: startMs < windowStart,
    continuesAfter: endMs > windowEnd,
  };
}
