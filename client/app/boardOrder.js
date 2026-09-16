import { bucketKey } from './boardBuckets.js';
import { placeTask } from './manualOrder.js';

// A card's place inside its cell, for boards drawn in manual order: where a
// drop lands between two cards, and the menu's top / up / down / bottom.
// DOM-free so node:test can import it.

/**
 * @typedef {import('./boardBuckets.js').TaskBoard} TaskBoard
 * @typedef {import('./boardBuckets.js').BoardContext} BoardContext
 * @typedef {import('./boardModel.js').BoardLayout} BoardLayout
 * @typedef {import('./boardActions.js').MoveGroup} MoveGroup
 * @typedef {import('./boardActions.js').MoveTarget} MoveTarget
 * @typedef {import('./manualOrder.js').OrderWrite} OrderWrite
 * @typedef {import('./state.js').Task} Task
 *
 * @typedef {Object} PlacedMove
 * @property {Partial<Task>} changes - the moved task's write, its order included
 * @property {OrderWrite[]} shifts - other tasks pushed down to make room
 */

/**
 * A move with the card's place in its target cell folded in.
 * @param {Partial<Task>} changes - what the move writes otherwise (`{}` within a cell)
 * @param {Task} task
 * @param {Task[]} cellTasks - the target cell as laid out; may include the task
 * @param {number} index - position among the cell's other tasks
 * @returns {PlacedMove}
 */
export function placedMove(changes, task, cellTasks, index) {
  const others = [];
  for (const other of cellTasks) {
    if (other.id !== task.id) others.push(other);
  }
  const placed = { ...changes };
  /** @type {OrderWrite[]} */
  const shifts = [];
  for (const write of placeTask(others, task, index)) {
    if (write.task.id === task.id) placed.sortOrder = write.sortOrder;
    else shifts.push(write);
  }
  return { changes: placed, shifts };
}

/**
 * The menu's order moves for a card, within the cell it sits in. Only moves
 * that go somewhere are listed, and "up one" is left out where it would be the
 * same as "top" (likewise down and bottom).
 * @param {TaskBoard} board
 * @param {BoardLayout} layout
 * @param {Task} task
 * @param {BoardContext} ctx
 * @returns {MoveGroup|null}
 */
export function orderGroup(board, layout, task, ctx) {
  let laneKey = '';
  if (board.lanes) laneKey = bucketKey(board.lanes, task, ctx);
  const cell = layout.cells.get(laneKey)?.get(bucketKey(board.columns, task, ctx)) || [];
  let position = -1;
  for (let i = 0; i < cell.length; i++) {
    if (cell[i].id === task.id) position = i;
  }
  if (position === -1) return null;

  const bottom = cell.length - 1;
  /** @type {MoveTarget[]} */
  const targets = [];
  if (position > 0) targets.push(orderTarget('Top', task, cell, 0));
  if (position > 1) targets.push(orderTarget('Up one', task, cell, position - 1));
  if (position < bottom - 1) targets.push(orderTarget('Down one', task, cell, position + 1));
  if (position < bottom) targets.push(orderTarget('Bottom', task, cell, bottom));
  if (!targets.length) return null;
  return { title: 'Order', targets };
}

/**
 * @param {string} label
 * @param {Task} task
 * @param {Task[]} cell
 * @param {number} index
 * @returns {MoveTarget}
 */
function orderTarget(label, task, cell, index) {
  const { changes, shifts } = placedMove({}, task, cell, index);
  return { label, current: false, changes, shifts };
}
