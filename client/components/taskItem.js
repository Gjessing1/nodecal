/**
 * Build a task list item element.
 * @param {object} task - API shape task
 * @param {object} callbacks - { onComplete, onStar, onClick }
 * @returns {HTMLElement}
 */
import { state } from '../app/state.js';
import { visibleCategories } from '../app/taskUtils.js';
import { formatShortDate } from '../app/utils.js';

export function buildTaskItem(task, { onComplete, onStar, onClick, onSnooze, showDue = false }) {
  const li = document.createElement('li');
  li.className = 'task-item' + (task.status === 'COMPLETED' ? ' task-done' : '');
  li.dataset.id = task.id;

  // Checkbox
  const check = document.createElement('button');
  check.className = 'task-check' + (task.status === 'COMPLETED' ? ' checked' : '');
  check.setAttribute('aria-label', task.status === 'COMPLETED' ? 'Mark incomplete' : 'Complete task');
  check.addEventListener('click', e => { e.stopPropagation(); onComplete(task); });

  // Body
  const body = document.createElement('div');
  body.className = 'task-body';
  body.addEventListener('click', () => onClick(task));

  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;

  if (task.description) {
    const notes = document.createElement('span');
    notes.className = 'task-notes';
    notes.textContent = task.description;
    body.appendChild(title);
    body.appendChild(notes);
  } else {
    body.appendChild(title);
  }

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  if (showDue && task.due) {
    const badge = document.createElement('span');
    const isOverdue = task.status !== 'COMPLETED' && isDueOverdue(task.due);
    badge.className = 'task-due-badge' + (isOverdue ? ' overdue' : '');
    badge.textContent = formatDue(task.due);
    meta.appendChild(badge);
  }
  if (task.recurring) {
    const rec = document.createElement('span');
    rec.className = 'task-recurring-icon';
    rec.textContent = '↻';
    meta.appendChild(rec);
  }

  if (meta.children.length) body.appendChild(meta);

  const hidden = state.config.hiddenCategories || [];
  const visCats = visibleCategories(task.categories || [], hidden);
  if (visCats.length) {
    const chips = document.createElement('div');
    chips.className = 'task-cats';
    for (const cat of visCats) {
      const chip = document.createElement('span');
      chip.className = 'task-cat-chip';
      chip.textContent = cat;
      chips.appendChild(chip);
    }
    body.appendChild(chips);
  }

  // Snooze (+1 day) — only for tasks with a due date
  if (task.due && onSnooze && task.status !== 'COMPLETED') {
    const snooze = document.createElement('button');
    snooze.className = 'task-snooze';
    snooze.textContent = '+1d';
    snooze.setAttribute('aria-label', 'Defer by 1 day');
    snooze.title = 'Defer to tomorrow';
    snooze.addEventListener('click', e => { e.stopPropagation(); onSnooze(task); });
    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(snooze);
  } else {
    li.appendChild(check);
    li.appendChild(body);
  }

  // Bell — shown beside snooze when reminder is set
  if (task.taskReminder && task.taskReminder !== 'none') {
    const bell = document.createElement('span');
    bell.className = 'task-reminder-icon';
    bell.textContent = '🔔';
    bell.title = 'Reminder set';
    li.appendChild(bell);
  }

  // Star
  const star = document.createElement('button');
  star.className = 'task-star' + (task.important ? ' starred' : '');
  star.textContent = '★';
  star.setAttribute('aria-label', task.important ? 'Remove important' : 'Mark important');
  star.addEventListener('click', e => { e.stopPropagation(); onStar(task); });

  li.appendChild(star);
  return li;
}

function isDueOverdue(due) {
  const today = todayString();
  return due < today;
}

function formatDue(due) {
  const today = todayString();
  const tomorrow = tomorrowString();
  if (due === today) return 'Today';
  if (due === tomorrow) return 'Tomorrow';
  const d = new Date(due + 'T00:00:00');
  return formatShortDate(d, state.config.dateFormat || 'dmy');
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function tomorrowString() {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
