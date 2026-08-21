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
  li.className =
    'flex items-start gap-sm border-b border-border px-md py-sm transition-colors duration-100 active:bg-surface';
  li.dataset.id = task.id;

  // Checkbox
  const check = document.createElement('button');
  check.className = 'task-check' + (task.status === 'COMPLETED' ? ' checked' : '');
  check.setAttribute(
    'aria-label',
    task.status === 'COMPLETED' ? 'Mark incomplete' : 'Complete task',
  );
  if (onComplete) {
    check.addEventListener('click', (e) => {
      e.stopPropagation();
      onComplete(task);
    });
  } else {
    check.disabled = true;
    check.title = 'Unavailable offline';
  }

  // Body
  const body = document.createElement('div');
  body.className = 'min-w-0 flex-1 cursor-pointer';
  if (onClick) body.addEventListener('click', () => onClick(task));

  const title = document.createElement('span');
  title.className =
    'block truncate text-md' + (task.status === 'COMPLETED' ? ' text-text-muted line-through' : '');
  title.textContent = task.title;

  if (task.description) {
    const notes = document.createElement('span');
    notes.className = 'mt-hairline line-clamp-2 text-sm text-text-muted';
    notes.textContent = task.description;
    body.appendChild(title);
    body.appendChild(notes);
  } else {
    body.appendChild(title);
  }

  const meta = document.createElement('div');
  meta.className = 'mt-2xs flex items-center gap-sm';

  if (showDue && task.due) {
    const badge = document.createElement('span');
    const isOverdue = task.status !== 'COMPLETED' && isDueOverdue(task.due);
    badge.className = 'text-sm ' + (isOverdue ? 'font-medium text-danger' : 'text-text-muted');
    badge.textContent = formatDue(task.due);
    meta.appendChild(badge);
  }
  if (task.recurring) {
    const rec = document.createElement('span');
    rec.className = 'text-sm text-text-muted';
    rec.textContent = '↻';
    meta.appendChild(rec);
  }

  if (meta.children.length) body.appendChild(meta);

  const hidden = state.config.hiddenCategories || [];
  const visCats = visibleCategories(task.categories || [], hidden);
  if (visCats.length) {
    const chips = document.createElement('div');
    chips.className = 'mt-pill-y flex flex-wrap gap-xs';
    for (const cat of visCats) {
      const chip = document.createElement('span');
      chip.className = 'task-cat-chip';
      chip.textContent = cat;
      chips.appendChild(chip);
    }
    body.appendChild(chips);
  }

  li.appendChild(check);
  li.appendChild(body);

  // Bell — shown before snooze when reminder is set
  if (task.taskReminder && task.taskReminder !== 'none') {
    const bell = document.createElement('span');
    bell.className = 'flex shrink-0 self-center items-center px-2xs text-caption opacity-70';
    bell.textContent = '🔔';
    bell.title = 'Reminder set';
    li.appendChild(bell);
  }

  // Snooze (+1 day) — only for tasks with a due date
  if (task.due && onSnooze && task.status !== 'COMPLETED') {
    const snooze = document.createElement('button');
    snooze.className =
      'shrink-0 self-center whitespace-nowrap rounded-sm border border-border px-field-y py-2xs text-xs text-text-muted transition-colors hover:border-accent hover:text-accent';
    snooze.textContent = '+1d';
    snooze.setAttribute('aria-label', 'Defer by 1 day');
    snooze.title = 'Defer to tomorrow';
    snooze.addEventListener('click', (e) => {
      e.stopPropagation();
      onSnooze(task);
    });
    li.appendChild(snooze);
  }

  // Star
  const star = document.createElement(onStar ? 'button' : 'span');
  star.className =
    'flex size-8 shrink-0 items-center justify-center self-center text-lg transition-colors hover:text-star ' +
    (task.important ? 'text-star' : 'text-border');
  star.textContent = '★';
  if (onStar) {
    star.setAttribute('aria-label', task.important ? 'Remove important' : 'Mark important');
    star.addEventListener('click', (e) => {
      e.stopPropagation();
      onStar(task);
    });
  } else {
    star.setAttribute('aria-hidden', 'true');
  }

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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tomorrowString() {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
