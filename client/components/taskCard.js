import { state } from '../app/state.js';
import { visibleCategories } from '../app/taskUtils.js';
import { buildDueBadge, buildPriorityBadge } from './taskItem.js';

/**
 * A task as a kanban card: the list row's content restacked for a narrow
 * column. Snooze is left to the list — on a board, moving a card is the edit.
 * @param {import('../app/state.js').Task} task
 * @param {{ onComplete: Function|null, onStar: Function|null, onClick: Function|null }} callbacks
 * @returns {HTMLElement}
 */
export function buildTaskCard(task, { onComplete, onStar, onClick }) {
  const isDone = task.status === 'COMPLETED';
  const card = document.createElement('article');
  card.className =
    'task-card flex cursor-pointer items-start gap-sm rounded-sm border border-border bg-bg p-sm text-left transition-colors duration-100 hover:border-accent focus-visible:border-accent';
  card.dataset.id = task.id;
  card.tabIndex = 0;
  card.setAttribute('aria-label', task.title);

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'task-check' + (isDone ? ' checked' : '');
  check.setAttribute('aria-label', isDone ? 'Mark incomplete' : 'Complete task');
  if (onComplete) {
    check.addEventListener('click', function completeFromCard(e) {
      e.stopPropagation();
      onComplete(task);
    });
  } else {
    check.disabled = true;
    check.title = 'Unavailable offline';
  }

  const body = document.createElement('div');
  body.className = 'min-w-0 flex-1';

  const title = document.createElement('span');
  title.className =
    'line-clamp-3 text-md break-words' + (isDone ? ' text-text-muted line-through' : '');
  title.textContent = task.title;
  body.appendChild(title);

  const meta = document.createElement('div');
  meta.className = 'mt-2xs flex flex-wrap items-center gap-x-sm gap-y-2xs';
  const priority = buildPriorityBadge(task);
  if (priority) meta.appendChild(priority);
  if (task.due) meta.appendChild(buildDueBadge(task));
  if (task.recurring) meta.appendChild(metaIcon('↻', 'Repeats'));
  if (task.taskReminder && task.taskReminder !== 'none') {
    meta.appendChild(metaIcon('🔔', 'Reminder set'));
  }
  if (meta.children.length) body.appendChild(meta);

  const categories = visibleCategories(task.categories || [], state.config.hiddenCategories || []);
  if (categories.length) {
    const chips = document.createElement('div');
    chips.className = 'mt-pill-y flex flex-wrap gap-xs';
    for (const cat of categories) {
      const chip = document.createElement('span');
      chip.className = 'task-cat-chip';
      chip.textContent = cat;
      chips.appendChild(chip);
    }
    body.appendChild(chips);
  }

  const star = document.createElement(onStar ? 'button' : 'span');
  star.className =
    'flex size-6 shrink-0 items-center justify-center text-md transition-colors hover:text-star ' +
    (task.important ? 'text-star' : 'text-border');
  star.textContent = '★';
  if (onStar) {
    /** @type {HTMLButtonElement} */ (star).type = 'button';
    star.setAttribute('aria-label', task.important ? 'Remove important' : 'Mark important');
    star.addEventListener('click', function starFromCard(e) {
      e.stopPropagation();
      onStar(task);
    });
  } else {
    star.setAttribute('aria-hidden', 'true');
  }

  if (onClick) {
    card.addEventListener('click', function openFromCard() {
      onClick(task);
    });
    card.addEventListener('keydown', function openFromKeyboard(e) {
      if (e.key === 'Enter' && e.target === card) onClick(task);
    });
  }

  card.append(check, body, star);
  return card;
}

/**
 * @param {string} symbol
 * @param {string} label
 */
function metaIcon(symbol, label) {
  const icon = document.createElement('span');
  icon.className = 'text-sm text-text-muted';
  icon.textContent = symbol;
  icon.title = label;
  return icon;
}
