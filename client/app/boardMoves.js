import { PRIORITY_VALUES, visibleCategories } from './taskUtils.js';
import { shiftDateStr } from './dayWindow.js';
import { NO_VALUE, bucketKey, bucketKeys } from './boardBuckets.js';

// What dropping a task onto a board writes back to it. DOM-free so node:test
// can import it.

/**
 * @typedef {import('./boardBuckets.js').BoardField} BoardField
 * @typedef {import('./boardBuckets.js').TaskBoard} TaskBoard
 * @typedef {import('./boardBuckets.js').BoardContext} BoardContext
 * @typedef {import('./boardBuckets.js').BoardPlace} BoardPlace
 * @typedef {import('./state.js').Task} Task
 */

/**
 * What moving a task into bucket `toKey` of `field` writes back, as a PUT body.
 * `{}` means it is already there; null means the move has no single meaning
 * ("Overdue" and "Later" name ranges, not dates) or is not supported (moving a
 * task to another source). A move to Done carries only the status: the caller
 * completes through the endpoint that advances recurring tasks.
 * @param {BoardField} field
 * @param {Task} task
 * @param {string} toKey
 * @param {BoardContext} ctx
 * @param {string} [fromKey] - the bucket the moved card is drawn in, where a
 *   task shown under every category has more than one
 * @returns {Partial<Task>|null}
 */
export function moveChanges(field, task, toKey, ctx, fromKey = bucketKey(field, task, ctx)) {
  if (fromKey === toKey) return {};

  if (field === 'status') {
    if (toKey === 'done') return { status: 'COMPLETED' };
    if (toKey === 'doing') return { status: 'IN-PROCESS', completed: null };
    return { status: 'NEEDS-ACTION', completed: null };
  }
  if (field === 'priority') {
    if (toKey in PRIORITY_VALUES) return { priority: PRIORITY_VALUES[toKey] };
    return null;
  }
  if (field === 'starred') {
    const categories = (task.categories || []).filter(isNotImportant);
    if (toKey === 'starred') categories.push('important');
    return { categories };
  }
  if (field === 'due') {
    if (toKey === 'today') return { due: ctx.today };
    if (toKey === 'tomorrow') return { due: shiftDateStr(ctx.today, 1) };
    if (toKey === NO_VALUE) return { due: null };
    return null;
  }
  if (field === 'source') return null;
  return { categories: moveCategory(task.categories || [], fromKey, toKey, ctx.hiddenCategories) };
}

/**
 * The combined change for dropping a task into a cell, or null if either axis
 * refuses. The lane change is worked out on the task as the column change left
 * it, since both can rewrite categories (a category board with starred lanes).
 *
 * A task shown under every category is already in each of its category cells,
 * so a drop onto another of them is refused rather than merging the two
 * categories into one.
 * @param {TaskBoard} board
 * @param {Task} task
 * @param {string} laneKey
 * @param {string} columnKey
 * @param {BoardContext} ctx
 * @param {BoardPlace} [from] - the cell the moved card is drawn in
 * @returns {Partial<Task>|null}
 */
export function dropChanges(board, task, laneKey, columnKey, ctx, from) {
  if (from && columnKey !== from.column && isDrawnIn(board, 'columns', task, columnKey, ctx)) {
    return null;
  }
  if (from && laneKey !== from.lane && isDrawnIn(board, 'lanes', task, laneKey, ctx)) return null;
  const columnChanges = moveChanges(board.columns, task, columnKey, ctx, from?.column);
  if (!columnChanges) return null;
  if (!board.lanes) return columnChanges;
  const laneChanges = moveChanges(
    board.lanes,
    { ...task, ...columnChanges },
    laneKey,
    ctx,
    from?.lane,
  );
  if (!laneChanges) return null;
  return { ...columnChanges, ...laneChanges };
}

/**
 * Whether one of the task's cards is drawn in bucket `key` of an axis.
 * @param {TaskBoard} board
 * @param {'columns'|'lanes'} axis
 * @param {Task} task
 * @param {string} key
 * @param {BoardContext} ctx
 */
export function isDrawnIn(board, axis, task, key, ctx) {
  const field = board[axis];
  if (!field) return key === '';
  let config = board.columnConfig;
  if (axis === 'lanes') config = board.laneConfig;
  return bucketKeys(field, task, ctx, config).includes(key);
}

/** @param {string} category */
function isNotImportant(category) {
  return category !== 'important';
}

/**
 * Swap the category a task is filed under for another, in place, so the new
 * one becomes the first visible category and lands the task in its column.
 * "Uncategorized" clears every visible category; hidden ones and the star stay.
 * @param {string[]} categories
 * @param {string} fromKey
 * @param {string} toKey
 * @param {string[]} hiddenCategories
 * @returns {string[]}
 */
function moveCategory(categories, fromKey, toKey, hiddenCategories) {
  const next = [];
  if (toKey === NO_VALUE) {
    for (const cat of categories) {
      if (!visibleCategories([cat], hiddenCategories).length) next.push(cat);
    }
    return next;
  }
  let replaced = false;
  for (const cat of categories) {
    if (cat === fromKey) {
      next.push(toKey);
      replaced = true;
    } else {
      next.push(cat);
    }
  }
  if (!replaced) next.unshift(toKey);

  const seen = new Set();
  const unique = [];
  for (const cat of next) {
    if (seen.has(cat)) continue;
    seen.add(cat);
    unique.push(cat);
  }
  return unique;
}
