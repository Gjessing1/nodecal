import { BOARD_FIELDS, NO_VALUE, bucketKey } from './boardBuckets.js';
import { dropChanges, moveChanges } from './boardMoves.js';
import { orderGroup } from './boardOrder.js';

// The board's moves that do not need a drag: the "Move to…" menu on a card and
// the "+" that adds a task straight into a column or lane. Both reuse the drop
// write-backs in boardMoves.js, so a menu move and a drag always agree.
// DOM-free so node:test can import it.

/**
 * @typedef {import('./boardBuckets.js').BoardField} BoardField
 * @typedef {import('./boardBuckets.js').TaskBoard} TaskBoard
 * @typedef {import('./boardBuckets.js').BoardContext} BoardContext
 * @typedef {import('./boardModel.js').BoardLayout} BoardLayout
 * @typedef {import('./state.js').Task} Task
 * @typedef {import('./manualOrder.js').OrderWrite} OrderWrite
 *
 * @typedef {Object} MoveTarget
 * @property {string} label
 * @property {boolean} current - the bucket the task already sits in
 * @property {Partial<Task>} changes - `{}` for the current bucket
 * @property {OrderWrite[]} [shifts] - other tasks' orders an order move rewrites
 *
 * @typedef {Object} MoveGroup
 * @property {string} title - the field's name, e.g. "Status"
 * @property {MoveTarget[]} targets
 */

/** @type {Task} */
const BLANK_TASK = { id: '', title: '', status: 'NEEDS-ACTION', categories: [] };

/**
 * Where a card can be moved from its menu: one group for the columns and, on a
 * board with lanes, one for the lanes. Each move changes one axis and keeps
 * the other. Buckets a drop would refuse are left out, and so is a group with
 * nowhere to go, so an empty result means the card has no menu. A board in
 * manual order adds a group that moves the card within its cell.
 * @param {TaskBoard} board
 * @param {BoardLayout} layout
 * @param {Task} task
 * @param {BoardContext} ctx
 * @param {boolean} [ordered] - the board is drawn in manual order
 * @returns {MoveGroup[]}
 */
export function moveGroups(board, layout, task, ctx, ordered = false) {
  const columnKey = bucketKey(board.columns, task, ctx);
  let laneKey = '';
  if (board.lanes) laneKey = bucketKey(board.lanes, task, ctx);

  /** @type {MoveGroup[]} */
  const groups = [];
  /** @type {MoveGroup} */
  const columns = { title: fieldLabel(board.columns), targets: [] };
  for (const column of layout.columns) {
    const target = moveTarget(board, task, laneKey, column.key, column.key === columnKey, ctx);
    if (target) columns.targets.push({ ...target, label: column.label });
  }
  if (hasMove(columns)) groups.push(columns);

  if (board.lanes) {
    /** @type {MoveGroup} */
    const lanes = { title: fieldLabel(board.lanes), targets: [] };
    for (const lane of layout.lanes) {
      const target = moveTarget(board, task, lane.key, columnKey, lane.key === laneKey, ctx);
      if (target) lanes.targets.push({ ...target, label: lane.label });
    }
    if (hasMove(lanes)) groups.push(lanes);
  }

  if (ordered) {
    const order = orderGroup(board, layout, task, ctx);
    if (order) groups.push(order);
  }
  return groups;
}

/**
 * The fields a new task starts with when it is added from bucket `key`, or null
 * where adding there has no single meaning: "Overdue" and "Later" are ranges,
 * a task is not created already done, and "No source" is nowhere to save it.
 * Source is the one field a new task can take that a move cannot change.
 * @param {BoardField} field
 * @param {string} key
 * @param {BoardContext} ctx
 * @returns {Partial<Task>|null}
 */
export function bucketDraft(field, key, ctx) {
  if (field === 'source') {
    if (key === NO_VALUE) return null;
    return { source: key };
  }
  if (field === 'status' && key === 'done') return null;
  const changes = moveChanges(field, BLANK_TASK, key, ctx);
  if (!changes) return null;
  // `completed: null` undoes a finished task on a move; a new one has nothing to undo.
  const draft = { ...changes };
  delete draft.completed;
  return draft;
}

/**
 * @param {TaskBoard} board
 * @param {Task} task
 * @param {string} laneKey
 * @param {string} columnKey
 * @param {boolean} current
 * @param {BoardContext} ctx
 * @returns {{current: boolean, changes: Partial<Task>}|null}
 */
function moveTarget(board, task, laneKey, columnKey, current, ctx) {
  if (current) return { current, changes: {} };
  const changes = dropChanges(board, task, laneKey, columnKey, ctx);
  if (!changes) return null;
  return { current, changes };
}

/** @param {{targets: MoveTarget[]}} group */
function hasMove(group) {
  for (const target of group.targets) {
    if (!target.current) return true;
  }
  return false;
}

/** @param {BoardField} field */
function fieldLabel(field) {
  for (const item of BOARD_FIELDS) {
    if (item.value === field) return item.label;
  }
  return field;
}
