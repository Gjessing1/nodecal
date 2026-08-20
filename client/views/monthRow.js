import { eventDayRange, layoutSpans } from './eventSpans.js';

// How one week row of the month grid divides itself up. The grid draws a chip
// per day rather than an overlay — real cells are what drag-and-drop and day
// taps work off — so a multi-day bar only reads as one bar if every cell it
// crosses puts it at the same height. That is decided here, for the row as a
// whole, because a cell on its own cannot know it is in the middle of a run.
//
// DOM-free on purpose: it is the part worth testing, and client/ code is only
// importable from Node while it stays free of the browser.

/**
 * @typedef {object} CellLayout
 * @property {(any|null)[]} slots - one chip row each; null holds a lane open
 * @property {number} hidden - events left out, for the cell's `+N`
 */

/** All-day first, then by start time — the order the day sheet uses too. */
function compareDayEvents(a, b) {
  return (
    (a.allDay ? -1 : 1) - (b.allDay ? -1 : 1) ||
    new Date(a.start).getTime() - new Date(b.start).getTime()
  );
}

/** Dense array up to the last filled lane; holes become spacers. */
function packSlots(slots) {
  let last = -1;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i]) last = i;
  }
  const packed = [];
  for (let i = 0; i <= last; i++) packed.push(slots[i] || null);
  return packed;
}

/**
 * Place a week's events into per-cell chip rows.
 *
 * @param {string[]} dayStrs - the row's seven local YYYY-MM-DD, earliest first
 * @param {any[]} events - the visible pool; anything missing the row is ignored
 * @param {number} maxRows - chip rows a cell has room for
 * @returns {CellLayout[]} one per day, in the same order as `dayStrs`
 */
export function layoutWeekRow(dayStrs, events, maxRows) {
  /** @type {CellLayout[]} */
  const layouts = [];
  for (let i = 0; i < dayStrs.length; i++) layouts.push({ slots: [], hidden: 0 });

  const spanning = [];
  /** @type {Map<number, any[]>} */
  const singleByDay = new Map();
  for (const ev of events) {
    const range = eventDayRange(ev);
    if (range.startStr !== range.endStr) {
      spanning.push(ev);
      continue;
    }
    const idx = dayStrs.indexOf(range.startStr);
    if (idx < 0) continue;
    const sameDay = singleByDay.get(idx);
    if (sameDay) sameDay.push(ev);
    else singleByDay.set(idx, [ev]);
  }

  // Bars claim their lane across the whole row and keep it in every cell. One
  // that lands past the cap is dropped from all of its cells, not from the ones
  // that happened to be full: a bar surviving in only its last cell reads as an
  // event on that day, which is worse than counting it into `+N` everywhere.
  for (const span of layoutSpans(spanning, dayStrs)) {
    for (let i = span.startIdx; i <= span.endIdx; i++) {
      if (span.lane >= maxRows) layouts[i].hidden++;
      else layouts[i].slots[span.lane] = span.event;
    }
  }

  // Single-day events fill whatever lanes the bars left, so they never push a
  // bar down and never take the row a bar is holding.
  for (const [idx, sameDay] of singleByDay) {
    sameDay.sort(compareDayEvents);
    const layout = layouts[idx];
    let lane = 0;
    for (const ev of sameDay) {
      while (lane < maxRows && layout.slots[lane]) lane++;
      if (lane >= maxRows) {
        layout.hidden++;
        continue;
      }
      layout.slots[lane] = ev;
      lane++;
    }
  }

  for (const layout of layouts) layout.slots = packSlots(layout.slots);
  return layouts;
}
