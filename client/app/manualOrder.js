// Manual task order, shared with Tasks.org (and Apple Reminders before it):
// a list sorts by X-APPLE-SORT-ORDER, lowest first, and a task without one
// ranks as the seconds from 2001-01-01 to its creation. An untouched list is
// therefore oldest first, and an order written here lands the task in the same
// place on the phone. DOM-free so node:test can import it.

/**
 * @typedef {import('./state.js').Task} Task
 *
 * @typedef {Object} OrderWrite
 * @property {Task} task
 * @property {number} sortOrder
 */

// Tasks.org's APPLE_EPOCH: Core Data's reference date.
const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);

// Room left beside a task placed with nothing on one side (top, bottom, or
// next to unranked tasks), so the next drop beside it usually fits without
// pushing other tasks down.
const OPEN_STEP = 1024;

/**
 * Where a task sits in manual order.
 * @param {Task} task
 * @returns {number|null} null when it has neither an order nor a creation time
 */
export function manualRank(task) {
  if (Number.isSafeInteger(task.sortOrder)) return task.sortOrder;
  if (!task.createdAt) return null;
  const created = Date.parse(task.createdAt);
  if (Number.isNaN(created)) return null;
  return Math.trunc((created - APPLE_EPOCH_MS) / 1000);
}

/**
 * Sort comparator: lowest rank first, unranked tasks after the rest in the
 * order they came.
 * @param {Task} a
 * @param {Task} b
 */
export function compareManual(a, b) {
  const rankA = manualRank(a);
  const rankB = manualRank(b);
  if (rankA === null && rankB === null) return 0;
  if (rankA === null) return 1;
  if (rankB === null) return -1;
  return rankA - rankB;
}

/**
 * The orders to write so `moved` sits at `index` among `others`, a list already
 * in manual order that does not contain it. Usually only the moved task
 * changes: it keeps its rank if that already fits, or takes the midpoint of
 * its new neighbours. With no room between them it goes just after the one
 * above, and the tasks below are pushed down one step at a time until the
 * order rises again, as Tasks.org does. Unranked tasks above the drop are
 * numbered so they stay above it; those below are left alone, since unranked
 * tasks sort after every ranked one anyway.
 * @param {Task[]} others
 * @param {Task} moved
 * @param {number} index
 * @returns {OrderWrite[]} empty when nothing needs to change
 */
export function placeTask(others, moved, index) {
  const at = Math.max(0, Math.min(index, others.length));
  const sequence = [...others.slice(0, at), moved, ...others.slice(at)];
  /** @type {OrderWrite[]} */
  const writes = [];
  /** @type {number|null} */
  let last = null;

  for (let i = 0; i < sequence.length; i++) {
    const task = sequence[i];
    const rank = manualRank(task);
    let wanted = rank;
    if (i < at) {
      // Above the drop point only an unranked task needs a number, so that it
      // stays above the moved one. Ties there change nothing below.
      if (rank === null) wanted = last === null ? 0 : last + OPEN_STEP;
    } else if (i === at) {
      let next = null;
      if (i + 1 < sequence.length) next = manualRank(sequence[i + 1]);
      wanted = slotRank(last, next, rank);
      // Unranked below and nothing ranked above: any number sorts it above them.
      if (wanted === null && i + 1 < sequence.length) wanted = 0;
    } else if (rank === null || last === null || rank > last) {
      // Rising again (or unranked from here on), and the list was sorted.
      break;
    } else {
      wanted = last + 1;
    }
    if (wanted !== null && wanted !== rank) writes.push({ task, sortOrder: wanted });
    if (wanted !== null && (last === null || wanted > last)) last = wanted;
  }
  return writes;
}

/**
 * The rank for a task placed between `prev` and `next` (either may be absent).
 * @param {number|null} prev
 * @param {number|null} next
 * @param {number|null} current - the task's rank now
 * @returns {number|null} null only when there is nothing to be relative to
 */
function slotRank(prev, next, current) {
  const belowPrev = prev === null || (current !== null && current > prev);
  const aboveNext = next === null || (current !== null && current < next);
  if (current !== null && belowPrev && aboveNext) return current;
  if (prev === null) {
    if (next === null) return current;
    return next - OPEN_STEP;
  }
  if (next === null) return prev + OPEN_STEP;
  if (next - prev >= 2) return prev + Math.floor((next - prev) / 2);
  return prev + 1;
}
