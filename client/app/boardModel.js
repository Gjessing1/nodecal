import { shiftDateStr } from './dayWindow.js';
import { bucketKey, fieldBuckets, isBoardField } from './boardBuckets.js';

// Assembles a kanban board from saved settings and the task list. DOM-free so
// node:test can import it; the rules per field live in boardBuckets.js.

/**
 * @typedef {import('./boardBuckets.js').TaskBoard} TaskBoard
 * @typedef {import('./boardBuckets.js').BoardBucket} BoardBucket
 * @typedef {import('./boardBuckets.js').BoardContext} BoardContext
 * @typedef {import('./state.js').Task} Task
 *
 * @typedef {Object} BoardLayout
 * @property {BoardBucket[]} columns
 * @property {BoardBucket[]} lanes
 * @property {Map<string, Map<string, Task[]>>} cells - lane key → column key → tasks
 */

/** @type {TaskBoard[]} */
export const DEFAULT_BOARDS = [
  { id: 'status', name: 'Status', columns: 'status', lanes: '' },
  { id: 'priority', name: 'Priority', columns: 'priority', lanes: '' },
  { id: 'category', name: 'Category', columns: 'category', lanes: '' },
];

// A Done column holding every task ever finished buries this week's work.
export const DONE_WINDOW_DAYS = 14;

/**
 * The boards to offer: the saved ones, or the built-in set when none are saved
 * (a board list can never be empty — the view always has something to draw).
 * @param {Record<string, any>} config
 * @returns {TaskBoard[]}
 */
export function boardsFromConfig(config) {
  const saved = config.taskBoards;
  if (!Array.isArray(saved)) return DEFAULT_BOARDS;
  /** @type {TaskBoard[]} */
  const boards = [];
  for (const board of saved) {
    if (!board || !board.id || !isBoardField(board.columns)) continue;
    /** @type {TaskBoard['lanes']} */
    let lanes = '';
    if (isBoardField(board.lanes) && board.lanes !== board.columns) lanes = board.lanes;
    boards.push({ id: board.id, name: board.name || 'Board', columns: board.columns, lanes });
  }
  if (!boards.length) return DEFAULT_BOARDS;
  return boards;
}

/**
 * Lay tasks out on a board. Completed tasks only appear when the board groups
 * by status, and then only those finished in the last DONE_WINDOW_DAYS. Input
 * order is kept inside each cell, so the caller sorts.
 * @param {Task[]} tasks
 * @param {TaskBoard} board
 * @param {BoardContext} ctx
 * @param {Task[]} [bucketTasks=tasks] - source-visible tasks before search and filters
 * @returns {BoardLayout}
 */
export function buildBoard(tasks, board, ctx, bucketTasks = tasks) {
  const usesStatus = board.columns === 'status' || board.lanes === 'status';
  const doneSince = shiftDateStr(ctx.today, -DONE_WINDOW_DAYS);
  const shown = [];
  for (const task of tasks) {
    if (task.status !== 'COMPLETED') {
      shown.push(task);
    } else if (usesStatus && task.completed && task.completed.slice(0, 10) >= doneSince) {
      shown.push(task);
    }
  }

  // Dynamic category/source buckets must survive search and filter changes so
  // an empty bucket remains a valid move target. Include shown completed tasks
  // too: a recent Done card may have a category no open task currently uses.
  const bucketPool = [...shown];
  for (const task of bucketTasks) {
    if (task.status !== 'COMPLETED') bucketPool.push(task);
  }

  const columns = fieldBuckets(board.columns, bucketPool, ctx);
  let lanes = [{ key: '', label: '' }];
  if (board.lanes) lanes = fieldBuckets(board.lanes, bucketPool, ctx);

  /** @type {Map<string, Map<string, Task[]>>} */
  const cells = new Map();
  for (const lane of lanes) {
    const row = new Map();
    for (const column of columns) row.set(column.key, []);
    cells.set(lane.key, row);
  }
  for (const task of shown) {
    let laneKey = '';
    if (board.lanes) laneKey = bucketKey(board.lanes, task, ctx);
    cells
      .get(laneKey)
      .get(bucketKey(board.columns, task, ctx))
      .push(task);
  }
  return { columns, lanes, cells };
}
