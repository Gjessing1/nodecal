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
 * order rises again, as Tasks.org does.
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
      if (rank === null) wanted = last === null ? 0 : last + 1;
    } else if (i === at) {
      let next = null;
      if (i + 1 < sequence.length) next = manualRank(sequence[i + 1]);
      wanted = slotRank(last, next, rank);
      // Unranked tasks below get numbered from this one, so it needs one too.
      if (wanted === null && i + 1 < sequence.length) wanted = 0;
    } else if (rank !== null && last !== null && rank > last) {
      // Rising again, and the list was sorted, so the rest already is.
      break;
    } else if (last !== null) {
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
    return next - 1;
  }
  if (next === null) return prev + 1;
  if (next - prev >= 2) return prev + Math.floor((next - prev) / 2);
  return prev + 1;
}
