// Capture what a kanban move must write to put every affected card back.
// Kept DOM-free so the recurring-completion and manual-order cases can be
// covered without a browser harness.

/**
 * @typedef {import('./state.js').Task} Task
 * @typedef {import('./manualOrder.js').OrderWrite} OrderWrite
 *
 * @typedef {Object} UndoOrderWrite
 * @property {Task} task
 * @property {number|null} sortOrder
 *
 * @typedef {Object} BoardMoveUndo
 * @property {Partial<Task>} changes
 * @property {UndoOrderWrite[]} shifts
 */

/**
 * The inverse write for a board move. Completing a recurring task changes its
 * due date on the server even though the drop itself only carries `status`, so
 * completion snapshots status, completion time and due date together.
 * @param {Task} task
 * @param {Partial<Task>} changes
 * @param {OrderWrite[]} shifts
 * @returns {BoardMoveUndo}
 */
export function boardMoveUndo(task, changes, shifts = []) {
  const fields = new Set(Object.keys(changes));
  if (changes.status === 'COMPLETED') {
    fields.add('status');
    fields.add('completed');
    fields.add('due');
  }

  /** @type {Record<string, any>} */
  const previous = {};
  for (const field of fields) previous[field] = previousValue(task, field);

  const previousShifts = [];
  for (const shift of shifts) {
    previousShifts.push({
      task: shift.task,
      sortOrder: Number.isSafeInteger(shift.task.sortOrder) ? shift.task.sortOrder : null,
    });
  }
  return { changes: previous, shifts: previousShifts };
}

/**
 * @param {Task} task
 * @param {string} field
 */
function previousValue(task, field) {
  if (field === 'status') return task.status || 'NEEDS-ACTION';
  if (field === 'completed') return task.completed || null;
  if (field === 'due') return task.due || null;
  if (field === 'priority') return task.priority || 0;
  if (field === 'categories') return [...(task.categories || [])];
  if (field === 'sortOrder') {
    return Number.isSafeInteger(task.sortOrder) ? task.sortOrder : null;
  }
  const taskFields = /** @type {Record<string, any>} */ (task);
  return taskFields[field] ?? null;
}
