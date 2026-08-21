// Horizontal layout for timed events in one day column. Vertical placement is
// handled by eventBlock.js; this module only finds events that occupy the same
// time and gives them stable side-by-side lanes.

/**
 * @typedef {object} TimeGridEntry
 * @property {any} ev
 * @property {import('./eventSegment.js').EventSegment} segment
 */

/**
 * @typedef {object} TimeGridLayout
 * @property {number} lane - zero-based horizontal lane
 * @property {number} columns - number of lanes shared by this conflict group
 * @property {boolean} conflict - whether the event overlaps another event
 */

/**
 * @typedef {object} OrderedEntry
 * @property {TimeGridEntry} entry
 * @property {number} index
 * @property {number} start
 * @property {number} end
 * @property {number} lane
 */

/**
 * Lay out one day column. Events that merely touch at an end/start boundary do
 * not conflict. A chain of overlaps shares one column count so widths remain
 * stable as the chain progresses down the grid.
 *
 * @param {TimeGridEntry[]} entries
 * @returns {(TimeGridEntry & { layout: TimeGridLayout })[]}
 */
export function layoutTimeGridSegments(entries) {
  /** @type {OrderedEntry[]} */
  const ordered = entries.map((entry, index) => ({
    entry,
    index,
    start: entry.segment.start.getTime(),
    end: entry.segment.end.getTime(),
    lane: 0,
  }));
  ordered.sort(compareEntries);

  /** @type {TimeGridLayout[]} */
  const layouts = entries.map(() => ({ lane: 0, columns: 1, conflict: false }));
  /** @type {OrderedEntry[]} */
  let group = [];
  let groupEnd = -Infinity;

  for (const item of ordered) {
    if (group.length > 0 && item.start >= groupEnd) {
      layoutGroup(group, layouts);
      group = [];
      groupEnd = -Infinity;
    }
    group.push(item);
    groupEnd = Math.max(groupEnd, item.end);
  }
  layoutGroup(group, layouts);

  return entries.map((entry, index) => ({ ...entry, layout: layouts[index] }));
}

/** @param {OrderedEntry} a @param {OrderedEntry} b */
function compareEntries(a, b) {
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return b.end - a.end;
  return a.index - b.index;
}

/**
 * @param {OrderedEntry[]} group
 * @param {TimeGridLayout[]} layouts
 */
function layoutGroup(group, layouts) {
  if (group.length === 0) return;
  /** @type {number[]} */
  const laneEnds = [];

  for (const item of group) {
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = item.end;
    item.lane = lane;
  }

  const columns = laneEnds.length;
  for (const item of group) {
    layouts[item.index] = { lane: item.lane, columns, conflict: columns > 1 };
  }
}
