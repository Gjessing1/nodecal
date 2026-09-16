import { PRIORITY_LEVELS, PRIORITY_VALUES, priorityLevel } from '../app/taskUtils.js';

// Priority and workflow status in the task editor. They sit together because a
// kanban board moves tasks along exactly these two axes, and the editor is
// where the same move is made without dragging.

const STATUS_OPTIONS = [
  { value: 'NEEDS-ACTION', label: 'To do' },
  { value: 'IN-PROCESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Done' },
];

/**
 * @param {import('../app/state.js').Task} task
 * @returns {string} option markup for the priority select
 */
export function priorityOptions(task) {
  const current = priorityLevel(task.priority);
  let html = '';
  for (const level of PRIORITY_LEVELS) {
    const selected = level.key === current ? ' selected' : '';
    html += `<option value="${level.key}"${selected}>${level.label}</option>`;
  }
  return html;
}

/**
 * @param {import('../app/state.js').Task} task
 * @returns {string} option markup for the status select
 */
export function statusOptions(task) {
  const current = task.status || 'NEEDS-ACTION';
  const options = [...STATUS_OPTIONS];
  // Only offered when another client set it, so saving here does not reopen it.
  if (current === 'CANCELLED') options.push({ value: 'CANCELLED', label: 'Cancelled' });
  let html = '';
  for (const option of options) {
    const selected = option.value === current ? ' selected' : '';
    html += `<option value="${option.value}"${selected}>${option.label}</option>`;
  }
  return html;
}

/**
 * The PRIORITY to save for the chosen level. An in-between value another client
 * wrote (3 is still "high") is kept while its level is left unchanged.
 * @param {import('../app/state.js').Task} task
 * @param {string} level
 * @returns {number}
 */
export function priorityToSave(task, level) {
  if (priorityLevel(task.priority) === level) return task.priority || 0;
  return PRIORITY_VALUES[level] ?? 0;
}

/**
 * Read-only rows for status and priority, skipping the unremarkable defaults.
 * @param {import('../app/state.js').Task} task
 * @returns {string[]}
 */
export function readOnlyStatusRows(task) {
  const rows = [];
  for (const option of STATUS_OPTIONS) {
    if (option.value === task.status && option.value !== 'NEEDS-ACTION') {
      rows.push(
        `<div class="readonly-row"><span class="readonly-label">Status</span> ${option.label}</div>`,
      );
    }
  }
  const level = priorityLevel(task.priority);
  if (level !== 'none') {
    const name = PRIORITY_LEVELS.find((item) => item.key === level).label;
    rows.push(
      `<div class="readonly-row"><span class="readonly-label">Priority</span> ${name}</div>`,
    );
  }
  return rows;
}
