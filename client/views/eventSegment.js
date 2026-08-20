// The part of a timed event that belongs to one day column of a time grid.
// An event running 22:00 Monday to 02:00 Tuesday is one event and two segments:
// the grid draws a block per column, so each block has to be clipped to its own
// day — otherwise Tuesday's block is drawn at Monday's clock time, four hours
// long, and reads as a second event.
//
// The day window is browser-local, matching how day.js and week.js bucket events
// into columns. `state.config.timezone` then positions the block inside the
// column (timeGrid.timeToTop); the two only agree while the configured zone is
// the device's, a divergence tracked under "Today/now indicator polish" in
// docs/ROADMAP.md and deliberately not widened here.

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
 * @param {Date} dayStart - local midnight opening the column
 * @param {Date} dayEnd - local midnight closing it; not always +24h, because of DST
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
