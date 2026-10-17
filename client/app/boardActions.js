import { BOARD_FIELDS, NO_VALUE, bucketKey } from './boardBuckets.js';
import { dropChanges, isDrawnIn, moveChanges } from './boardMoves.js';
import { orderGroup } from './boardOrder.js';

// The board's moves that do not need a drag: the "Move to…" menu on a card and
// the "+" that adds a task straight into a column or lane. Both reuse the drop
// write-backs in boardMoves.js, so a menu move and a drag always agree.
// DOM-free so node:test can import it.

/**
 * @typedef {import('./boardBuckets.js').BoardField} BoardField
 * @typedef {import('./boardBuckets.js').TaskBoard} TaskBoard
 * @typedef {import('./boardBuckets.js').BoardContext} BoardContext
 * @typedef {import('./boardBuckets.js').BoardPlace} BoardPlace
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
 * manual order adds a group that moves the card within its cell. Every bucket
 * the task is drawn in is marked current, not only the card's own.
 * @param {TaskBoard} board
 * @param {BoardLayout} layout
 * @param {Task} task
 * @param {BoardContext} ctx
 * @param {boolean} [ordered] - the board is drawn in manual order
 * @param {BoardPlace} [from] - the card's cell; defaults to the task's only one
 * @returns {MoveGroup[]}
 */
export function moveGroups(
  board,
  layout,
  task,
  ctx,
  ordered = false,
  from = taskPlace(board, task, ctx),
) {
  /** @type {MoveGroup[]} */
  const groups = [];
  /** @type {MoveGroup} */
  const columns = { title: fieldLabel(board.columns), targets: [] };
  for (const column of layout.columns) {
    const current = isDrawnIn(board, 'columns', task, column.key, ctx);
    const target = moveTarget(board, task, from.lane, column.key, current, ctx, from);
    if (target) columns.targets.push({ ...target, label: column.label });
  }
  if (hasMove(columns)) groups.push(columns);

  if (board.lanes) {
    /** @type {MoveGroup} */
    const lanes = { title: fieldLabel(board.lanes), targets: [] };
    for (const lane of layout.lanes) {
      const current = isDrawnIn(board, 'lanes', task, lane.key, ctx);
      const target = moveTarget(board, task, lane.key, from.column, current, ctx, from);
      if (target) lanes.targets.push({ ...target, label: lane.label });
    }
    if (hasMove(lanes)) groups.push(lanes);
  }

  if (ordered) {
    const order = orderGroup(layout, task, from);
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
 * @param {{source: string, category: string}} [filters] - prefill active filters where compatible
 * @returns {Partial<Task>|null}
 */
export function bucketDraft(field, key, ctx, filters = { source: '', category: '' }) {
  /** @type {Partial<Task>} */
  let draft;
  if (field === 'source') {
    if (key === NO_VALUE) return null;
    draft = { source: key };
  } else {
    if (field === 'status' && key === 'done') return null;
    const changes = moveChanges(field, BLANK_TASK, key, ctx);
    if (!changes) return null;
    // `completed: null` undoes a finished task on a move; a new one has nothing to undo.
    draft = { ...changes };
    delete draft.completed;
  }
  if (filters.source && !draft.source) draft.source = filters.source;
  if (filters.category && !(draft.categories || []).includes(filters.category)) {
    draft.categories = [...(draft.categories || []), filters.category];
  }
  return draft;
}

/**
 * The cell a task's card is drawn in when it has only one.
 * @param {TaskBoard} board
 * @param {Task} task
 * @param {BoardContext} ctx
 * @returns {BoardPlace}
 */
export function taskPlace(board, task, ctx) {
  let lane = '';
  if (board.lanes) lane = bucketKey(board.lanes, task, ctx);
  return { lane, column: bucketKey(board.columns, task, ctx) };
}

/**
 * @param {TaskBoard} board
 * @param {Task} task
 * @param {string} laneKey
 * @param {string} columnKey
 * @param {boolean} current
 * @param {BoardContext} ctx
 * @param {BoardPlace} from
 * @returns {{current: boolean, changes: Partial<Task>}|null}
 */
function moveTarget(board, task, laneKey, columnKey, current, ctx, from) {
  if (current) return { current, changes: {} };
  const changes = dropChanges(board, task, laneKey, columnKey, ctx, from);
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
