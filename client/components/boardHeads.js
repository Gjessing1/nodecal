// Column and lane headers for the kanban board: a label, a card count and,
// where a new task has a clear place in that bucket, a "+" to add one there.

const ADD_BUTTON_CLASSES =
  'flex size-6 shrink-0 items-center justify-center rounded-sm text-lg leading-none font-normal text-text-muted transition-colors hover:bg-surface hover:text-accent';

/**
 * A column header. It sticks to the top while the board scrolls, so its "+"
 * stays in reach at the bottom of a long column.
 * @param {string} label
 * @param {number} count
 * @param {{ hint?: string, onAdd?: (() => void)|null }} opts
 * @returns {HTMLElement}
 */
export function buildColumnHead(label, count, { hint = '', onAdd = null }) {
  const head = document.createElement('div');
  head.className =
    'task-board-head sticky top-0 z-10 flex snap-start items-center gap-xs bg-bg px-xs py-xs text-sm font-semibold tracking-wider text-text-muted uppercase';
  if (hint) head.title = hint;
  const name = document.createElement('span');
  name.className = 'truncate';
  name.textContent = label;
  const tally = document.createElement('span');
  tally.className = 'font-normal';
  tally.textContent = String(count);
  head.append(name, tally);
  if (onAdd) head.appendChild(buildAddButton(label, onAdd, 'ml-auto'));
  return head;
}

/**
 * A lane's header spans the whole row; its controls stick to the left edge so
 * they stay readable however far the board is scrolled across.
 * @param {string} label
 * @param {number} count
 * @param {{ folded: boolean, onToggle: () => void, onAdd?: (() => void)|null }} opts
 * @returns {HTMLElement}
 */
export function buildLaneHead(label, count, { folded, onToggle, onAdd = null }) {
  const row = document.createElement('div');
  row.className = 'col-span-full border-t border-border pt-xs';
  const controls = document.createElement('div');
  controls.className = 'sticky left-0 flex w-fit items-center gap-xs';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className =
    'flex items-center gap-xs rounded-sm px-xs py-xs text-sm font-semibold text-text';
  toggle.setAttribute('aria-expanded', String(!folded));
  const chevron = document.createElement('span');
  chevron.className = 'text-text-muted';
  chevron.textContent = folded ? '▸' : '▾';
  const name = document.createElement('span');
  name.textContent = label;
  const tally = document.createElement('span');
  tally.className = 'font-normal text-text-muted';
  tally.textContent = String(count);
  toggle.append(chevron, name, tally);
  toggle.addEventListener('click', onToggle);

  controls.appendChild(toggle);
  if (onAdd) controls.appendChild(buildAddButton(label, onAdd, ''));
  row.appendChild(controls);
  return row;
}

/**
 * @param {string} label - the bucket's name, for the accessible label
 * @param {() => void} onAdd
 * @param {string} extraClasses
 */
function buildAddButton(label, onAdd, extraClasses) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = extraClasses ? `${ADD_BUTTON_CLASSES} ${extraClasses}` : ADD_BUTTON_CLASSES;
  button.textContent = '+';
  button.setAttribute('aria-label', `Add task to ${label}`);
  button.title = `Add task to ${label}`;
  button.addEventListener('click', onAdd);
  return button;
}
