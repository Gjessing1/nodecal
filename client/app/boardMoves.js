import { PRIORITY_VALUES, visibleCategories } from './taskUtils.js';
import { shiftDateStr } from './dayWindow.js';
import { NO_VALUE, bucketKey } from './boardBuckets.js';

// What dropping a task onto a board writes back to it. DOM-free so node:test
// can import it.

/**
 * @typedef {import('./boardBuckets.js').BoardField} BoardField
 * @typedef {import('./boardBuckets.js').TaskBoard} TaskBoard
 * @typedef {import('./boardBuckets.js').BoardContext} BoardContext
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
 * @returns {Partial<Task>|null}
 */
export function moveChanges(field, task, toKey, ctx) {
  const fromKey = bucketKey(field, task, ctx);
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
 * @param {TaskBoard} board
 * @param {Task} task
 * @param {string} laneKey
 * @param {string} columnKey
 * @param {BoardContext} ctx
 * @returns {Partial<Task>|null}
 */
export function dropChanges(board, task, laneKey, columnKey, ctx) {
  const columnChanges = moveChanges(board.columns, task, columnKey, ctx);
  if (!columnChanges) return null;
  if (!board.lanes) return columnChanges;
  const laneChanges = moveChanges(board.lanes, { ...task, ...columnChanges }, laneKey, ctx);
  if (!laneChanges) return null;
  return { ...columnChanges, ...laneChanges };
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
