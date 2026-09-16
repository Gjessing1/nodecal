import { priorityLevel, visibleCategories } from './taskUtils.js';
import { shiftDateStr } from './dayWindow.js';

// A kanban board is two groupings of one task list: columns across and,
// optionally, swim lanes down. Both draw from the same set of fields, so the
// rules per field live once, split between the grouping (here: its buckets and
// which bucket a task sits in) and the write-back (boardMoves.js: what dropping
// a task into a bucket changes). boardModel.js assembles a board; the view only
// lays the result out.
//
// DOM-free on purpose: it is the part worth testing, and client/ code is only
// importable from Node while it stays free of the browser.

/**
 * @typedef {'status'|'priority'|'category'|'due'|'source'|'starred'} BoardField
 *
 * @typedef {Object} TaskBoard
 * @property {string} id
 * @property {string} name
 * @property {BoardField} columns
 * @property {BoardField|''} lanes - '' draws one unlabelled lane
 *
 * @typedef {Object} BoardBucket
 * @property {string} key
 * @property {string} label
 *
 * @typedef {Object} BoardContext
 * @property {string} today - 'YYYY-MM-DD' in the configured timezone
 * @property {string[]} hiddenCategories
 * @property {Array<{url: string, name: string}>} sources - visible task sources, in display order
 *
 * @typedef {import('./state.js').Task} Task
 */

/** Fields a board can group by. Mirrored in server/routes/settings.js. */
export const BOARD_FIELDS = [
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'category', label: 'Category' },
  { value: 'due', label: 'Due date' },
  { value: 'source', label: 'Source' },
  { value: 'starred', label: 'Starred' },
];

// Bucket keys end up in data-* attributes, so "no value" needs a real string.
export const NO_VALUE = '__none__';

/**
 * @param {*} value
 * @returns {value is BoardField}
 */
export function isBoardField(value) {
  for (const field of BOARD_FIELDS) {
    if (field.value === value) return true;
  }
  return false;
}

/**
 * Which bucket of `field` a task belongs in.
 * @param {BoardField} field
 * @param {Task} task
 * @param {BoardContext} ctx
 * @returns {string}
 */
export function bucketKey(field, task, ctx) {
  if (field === 'status') {
    if (task.status === 'COMPLETED') return 'done';
    if (task.status === 'IN-PROCESS') return 'doing';
    return 'todo';
  }
  if (field === 'priority') return priorityLevel(task.priority);
  if (field === 'starred') {
    // Read the category, not task.important: a drop that rewrote the categories
    // has not recomputed the derived flag yet.
    if ((task.categories || []).includes('important')) return 'starred';
    return 'other';
  }
  if (field === 'due') {
    if (!task.due) return NO_VALUE;
    if (task.due < ctx.today) return 'overdue';
    if (task.due === ctx.today) return 'today';
    if (task.due === shiftDateStr(ctx.today, 1)) return 'tomorrow';
    return 'later';
  }
  if (field === 'source') {
    for (const source of ctx.sources) {
      if (source.url === task.source) return source.url;
    }
    return NO_VALUE;
  }
  // category: the first visible one, as "Group: Category" in the list does.
  return visibleCategories(task.categories || [], ctx.hiddenCategories)[0] || NO_VALUE;
}

/**
 * The buckets `field` splits tasks into, in display order. Fixed fields list
 * every bucket so an empty one is still somewhere to drop; category and source
 * list the values present, plus "none" where dropping there means something.
 * @param {BoardField} field
 * @param {Task[]} tasks
 * @param {BoardContext} ctx
 * @returns {BoardBucket[]}
 */
export function fieldBuckets(field, tasks, ctx) {
  if (field === 'status') {
    return [
      { key: 'todo', label: 'To do' },
      { key: 'doing', label: 'In progress' },
      { key: 'done', label: 'Done' },
    ];
  }
  if (field === 'priority') {
    return [
      { key: 'high', label: 'High' },
      { key: 'medium', label: 'Medium' },
      { key: 'low', label: 'Low' },
      { key: 'none', label: 'No priority' },
    ];
  }
  if (field === 'due') {
    return [
      { key: 'overdue', label: 'Overdue' },
      { key: 'today', label: 'Today' },
      { key: 'tomorrow', label: 'Tomorrow' },
      { key: 'later', label: 'Later' },
      { key: NO_VALUE, label: 'No due date' },
    ];
  }
  if (field === 'starred') {
    return [
      { key: 'starred', label: '★ Starred' },
      { key: 'other', label: 'Not starred' },
    ];
  }
  if (field === 'source') return sourceBuckets(tasks, ctx);
  return categoryBuckets(tasks, ctx);
}

/**
 * @param {Task[]} tasks
 * @param {BoardContext} ctx
 * @returns {BoardBucket[]}
 */
function sourceBuckets(tasks, ctx) {
  const buckets = [];
  for (const source of ctx.sources) {
    buckets.push({ key: source.url, label: source.name || source.url });
  }
  for (const task of tasks) {
    if (bucketKey('source', task, ctx) === NO_VALUE) {
      buckets.push({ key: NO_VALUE, label: 'No source' });
      break;
    }
  }
  return buckets;
}

/**
 * Every visible category on the shown tasks, not only first categories: a
 * category that is nobody's first is still a column a task can be moved into.
 * @param {Task[]} tasks
 * @param {BoardContext} ctx
 * @returns {BoardBucket[]}
 */
function categoryBuckets(tasks, ctx) {
  const names = new Set();
  for (const task of tasks) {
    for (const cat of visibleCategories(task.categories || [], ctx.hiddenCategories)) {
      names.add(cat);
    }
  }
  const buckets = [];
  for (const name of [...names].sort()) buckets.push({ key: name, label: name });
  buckets.push({ key: NO_VALUE, label: 'Uncategorized' });
  return buckets;
}
