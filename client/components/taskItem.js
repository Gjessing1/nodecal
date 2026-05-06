/**
 * Build a task list item element.
 * @param {object} task - API shape task
 * @param {object} callbacks - { onComplete, onStar, onClick }
 * @returns {HTMLElement}
 */
export function buildTaskItem(task, { onComplete, onStar, onClick }) {
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

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  if (task.due) {
    const badge = document.createElement('span');
    badge.className = 'task-due-badge' + (isDueOverdue(task.due) ? ' overdue' : '');
    badge.textContent = formatDue(task.due);
    meta.appendChild(badge);
  }
  if (task.recurring) {
    const rec = document.createElement('span');
    rec.className = 'task-recurring-icon';
    rec.textContent = '↻';
    meta.appendChild(rec);
  }

  body.appendChild(title);
  if (meta.children.length) body.appendChild(meta);

  // Star
  const star = document.createElement('button');
  star.className = 'task-star' + (task.important ? ' starred' : '');
  star.textContent = '★';
  star.setAttribute('aria-label', task.important ? 'Remove important' : 'Mark important');
  star.addEventListener('click', e => { e.stopPropagation(); onStar(task); });

  li.appendChild(check);
  li.appendChild(body);
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
  // YYYY-MM-DD → short date
  const d = new Date(due + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function tomorrowString() {
  const d = new Date(Date.now() + 86400000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
