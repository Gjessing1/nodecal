import { state } from '../app/state.js';
import { buildTaskItem } from '../components/taskItem.js';
import { toDateInputValue } from '../app/utils.js';

// Callbacks set on first render, reused for quick-add
let _callbacks = null;

/**
 * Render the tasks view.
 * @param {HTMLElement} container
 * @param {object} callbacks - { onComplete, onStar, onAdd, onEdit, onDelete }
 */
export function renderTasks(container, callbacks) {
  _callbacks = callbacks;
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'tasks-view';

  // Controls row: show-completed toggle, starred-only toggle, sort selector
  const controls = document.createElement('div');
  controls.className = 'tasks-controls';

  const filterState = { showDone: false, starredOnly: false };

  const leftFilters = document.createElement('div');
  leftFilters.className = 'tasks-filters';

  const showDoneLabel = document.createElement('label');
  showDoneLabel.className = 'tasks-show-done';
  const showDoneCheck = document.createElement('input');
  showDoneCheck.type = 'checkbox';
  showDoneCheck.id = 'tasks-show-done';
  showDoneCheck.addEventListener('change', () => {
    filterState.showDone = showDoneCheck.checked;
    renderList(list, filterState, sortSel.value, callbacks);
  });
  showDoneLabel.appendChild(showDoneCheck);
  showDoneLabel.appendChild(document.createTextNode(' Done'));

  const starredOnlyLabel = document.createElement('label');
  starredOnlyLabel.className = 'tasks-show-done';
  const starredOnlyCheck = document.createElement('input');
  starredOnlyCheck.type = 'checkbox';
  starredOnlyCheck.addEventListener('change', () => {
    filterState.starredOnly = starredOnlyCheck.checked;
    renderList(list, filterState, sortSel.value, callbacks);
  });
  starredOnlyLabel.appendChild(starredOnlyCheck);
  starredOnlyLabel.appendChild(document.createTextNode(' Starred'));

  const sortSel = document.createElement('select');
  sortSel.className = 'tasks-sort-select';
  sortSel.innerHTML = `
    <option value="due">Sort: Due date</option>
    <option value="starred">Sort: Starred first</option>
    <option value="alpha">Sort: A–Z</option>
    <option value="created">Sort: Created</option>
  `;
  sortSel.value = state.config.taskSortOrder || 'due';
  sortSel.addEventListener('change', () => {
    renderList(list, filterState, sortSel.value, callbacks);
  });

  leftFilters.appendChild(showDoneLabel);
  leftFilters.appendChild(starredOnlyLabel);
  controls.appendChild(leftFilters);
  controls.appendChild(sortSel);

  // Task list
  const list = document.createElement('div');
  list.className = 'tasks-list';
  renderList(list, filterState, sortSel.value, callbacks);

  // Quick-add bar
  const quickAdd = buildQuickAdd(callbacks);

  wrap.appendChild(controls);
  wrap.appendChild(list);
  wrap.appendChild(quickAdd);
  container.appendChild(wrap);
}

/** Focus the quick-add input (called when FAB is tapped in tasks view). */
export function focusTaskQuickAdd() {
  document.getElementById('task-quick-add-input')?.focus();
}

// ── List rendering ────────────────────────────────────────

function renderList(container, filterState, sortOrder, callbacks) {
  container.innerHTML = '';

  let tasks = state.tasks.filter(t => filterState.showDone || t.status !== 'COMPLETED');
  if (filterState.starredOnly) tasks = tasks.filter(t => t.important);
  tasks = sortTasks(tasks, sortOrder);

  const today    = localDateString(new Date());
  const tomorrow = localDateString(new Date(Date.now() + 86400000));

  const overdue = [];
  const todayItems = [];
  const tomorrowItems = [];
  const byDate = new Map();
  const noDue = [];

  for (const task of tasks) {
    if (!task.due) {
      noDue.push(task);
    } else if (task.due < today) {
      overdue.push(task);
    } else if (task.due === today) {
      todayItems.push(task);
    } else if (task.due === tomorrow) {
      tomorrowItems.push(task);
    } else {
      if (!byDate.has(task.due)) byDate.set(task.due, []);
      byDate.get(task.due).push(task);
    }
  }

  const groups = [];
  if (overdue.length)     groups.push({ key: 'overdue',   label: 'Overdue',   overdue: true, items: overdue });
  if (todayItems.length)  groups.push({ key: 'today',     label: 'Today',     items: todayItems });
  if (tomorrowItems.length) groups.push({ key: 'tomorrow', label: 'Tomorrow',  items: tomorrowItems });
  for (const [date, items] of [...byDate.entries()].sort()) {
    groups.push({ key: date, label: formatDateHeader(date), items });
  }
  if (noDue.length) groups.push({ key: 'none', label: 'No due date', items: noDue });

  let isEmpty = true;
  for (const group of groups) {
    if (!group.items.length) continue;
    isEmpty = false;
    const section = document.createElement('section');
    section.className = 'tasks-group';

    const heading = document.createElement('h3');
    heading.className = 'tasks-group-label' + (group.overdue ? ' overdue' : '');
    heading.textContent = group.label;
    section.appendChild(heading);

    const ul = document.createElement('ul');
    ul.className = 'tasks-group-list';
    for (const task of group.items) {
      ul.appendChild(buildTaskItem(task, {
        onComplete: t => callbacks.onComplete(t),
        onStar:     t => callbacks.onStar(t),
        onClick:    t => callbacks.onEdit(t),
      }));
    }
    section.appendChild(ul);
    container.appendChild(section);
  }

  if (isEmpty) {
    const empty = document.createElement('p');
    empty.className = 'tasks-empty';
    empty.textContent = state.tasks.length ? 'All done! ✓' : 'No tasks yet — add one below.';
    container.appendChild(empty);
  }
}

function sortTasks(tasks, order) {
  const copy = [...tasks];
  if (order === 'alpha') {
    return copy.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (order === 'created') {
    return copy.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  }
  if (order === 'starred') {
    return copy.sort((a, b) => {
      if (a.important && !b.important) return -1;
      if (!a.important && b.important) return 1;
      if (a.due && b.due) return a.due.localeCompare(b.due);
      if (a.due) return -1;
      if (b.due) return 1;
      return 0;
    });
  }
  // 'due': tasks with a due date first (ascending), then no-due tasks
  return copy.sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });
}

// ── Quick-add bar ─────────────────────────────────────────

function buildQuickAdd(callbacks) {
  const bar = document.createElement('div');
  bar.className = 'tasks-quickadd';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'task-quick-add-input';
  input.className = 'tasks-quickadd-input';
  input.placeholder = 'Add a task…';

  const dates = document.createElement('div');
  dates.className = 'tasks-quickadd-dates';

  let selectedDue = null;

  const today    = localDateString(new Date());
  const tomorrow = localDateString(new Date(Date.now() + 86400000));

  function makeShortcut(label, value) {
    const btn = document.createElement('button');
    btn.className = 'tasks-date-shortcut';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      selectedDue = value;
      updateActive();
    });
    return btn;
  }

  const todayBtn    = makeShortcut('Today',    today);
  const tomorrowBtn = makeShortcut('Tomorrow', tomorrow);

  const pickBtn = document.createElement('button');
  pickBtn.className = 'tasks-date-shortcut';
  pickBtn.textContent = 'Pick date';

  const datePicker = document.createElement('input');
  datePicker.type = 'date';
  datePicker.className = 'tasks-date-picker-hidden';
  datePicker.addEventListener('change', () => {
    if (datePicker.value) {
      selectedDue = datePicker.value;
      updateActive();
    }
  });
  pickBtn.addEventListener('click', () => datePicker.showPicker?.() || datePicker.click());

  function updateActive() {
    todayBtn.classList.toggle('active', selectedDue === today);
    tomorrowBtn.classList.toggle('active', selectedDue === tomorrow);
    pickBtn.classList.toggle('active', selectedDue && selectedDue !== today && selectedDue !== tomorrow);
    if (pickBtn.classList.contains('active') && selectedDue) {
      const d = new Date(selectedDue + 'T00:00:00');
      pickBtn.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else {
      pickBtn.textContent = 'Pick date';
    }
  }

  dates.appendChild(todayBtn);
  dates.appendChild(tomorrowBtn);
  dates.appendChild(pickBtn);
  dates.appendChild(datePicker);

  async function submit() {
    const title = input.value.trim();
    if (!title) return;
    input.value = '';
    const due = selectedDue;
    selectedDue = null;
    updateActive();
    await callbacks.onAdd({ title, due });
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') submit();
  });

  const submitBtn = document.createElement('button');
  submitBtn.className = 'tasks-quickadd-submit';
  submitBtn.textContent = '↵';
  submitBtn.setAttribute('aria-label', 'Add task');
  submitBtn.addEventListener('click', submit);

  const row = document.createElement('div');
  row.className = 'tasks-quickadd-row';
  row.appendChild(input);
  row.appendChild(submitBtn);

  bar.appendChild(row);
  bar.appendChild(dates);
  return bar;
}

// ── Task edit modal ───────────────────────────────────────

export function openTaskModal(task, { onSave, onDelete }) {
  const overlay = document.getElementById('modal-overlay');
  const sheet = overlay.querySelector('.modal-sheet');

  const isRecAfterCompletion = task.recurringType === 'after-completion';
  const isRecRrule = task.recurringType === 'rrule';
  const isCompleted = task.status === 'COMPLETED';

  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">${task.uid ? 'Edit task' : 'New task'}</div>

    <div class="modal-field">
      <label>Title</label>
      <input type="text" id="tm-title" value="${esc(task.title || '')}" placeholder="Task title">
    </div>

    <div class="modal-field">
      <label>Due date</label>
      <input type="date" id="tm-due" value="${task.due || ''}">
    </div>

    <div class="modal-field">
      <label>Notes</label>
      <textarea id="tm-desc" rows="3">${esc(task.description || '')}</textarea>
    </div>

    <div class="modal-field">
      <label>Repeat</label>
      <select id="tm-recurring">
        <option value="">None</option>
        <option value="rrule-daily"    ${isRecRrule && task.rrule?.includes('DAILY')    ? 'selected' : ''}>Daily</option>
        <option value="rrule-weekly"   ${isRecRrule && task.rrule?.includes('WEEKLY')   ? 'selected' : ''}>Weekly</option>
        <option value="rrule-monthly"  ${isRecRrule && task.rrule?.includes('MONTHLY')  ? 'selected' : ''}>Monthly</option>
        <option value="after-custom"   ${isRecAfterCompletion ? 'selected' : ''}>__ days after completion</option>
      </select>
    </div>

    <div class="modal-field" id="tm-interval-field" style="${isRecAfterCompletion ? '' : 'display:none'}">
      <label>Interval (e.g. 3d, 2w)</label>
      <input type="text" id="tm-interval" value="${esc(task.recurringInterval || '')}" placeholder="e.g. 3d, 2w">
    </div>

    <div class="modal-field modal-field-checkbox">
      <label>
        <input type="checkbox" id="tm-completed" ${isCompleted ? 'checked' : ''}>
        Mark as completed
      </label>
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary" id="tm-save">Save</button>
      ${task.uid ? '<button class="btn btn-ghost" id="tm-delete" style="color:var(--color-danger)">Delete</button>' : ''}
      <button class="btn btn-ghost" id="tm-cancel">Cancel</button>
    </div>
  `;

  sheet.querySelector('#tm-recurring').addEventListener('change', e => {
    const show = e.target.value === 'after-custom';
    sheet.querySelector('#tm-interval-field').style.display = show ? '' : 'none';
  });

  sheet.querySelector('#tm-save').addEventListener('click', () => {
    const title = sheet.querySelector('#tm-title').value.trim();
    if (!title) { alert('Title is required'); return; }

    const recurringVal = sheet.querySelector('#tm-recurring').value;
    let rrule = null, xRecurringType = null, xRecurringInterval = null;
    if (recurringVal === 'rrule-daily')    rrule = 'FREQ=DAILY';
    else if (recurringVal === 'rrule-weekly')   rrule = buildWeeklyRrule(sheet.querySelector('#tm-due').value);
    else if (recurringVal === 'rrule-monthly')  rrule = buildMonthlyRrule(sheet.querySelector('#tm-due').value);
    else if (recurringVal === 'after-custom') {
      xRecurringType = 'after-completion';
      xRecurringInterval = sheet.querySelector('#tm-interval').value.trim() || 'weekly';
    }

    const completedChecked = sheet.querySelector('#tm-completed').checked;

    onSave({
      title,
      due:  sheet.querySelector('#tm-due').value || null,
      description: sheet.querySelector('#tm-desc').value.trim(),
      status: completedChecked ? 'COMPLETED' : 'NEEDS-ACTION',
      completed: completedChecked ? new Date().toISOString() : null,
      rrule, xRecurringType, xRecurringInterval,
    });
    closeTaskModal();
  });

  if (task.uid) {
    sheet.querySelector('#tm-delete').addEventListener('click', () => {
      if (confirm('Delete this task?')) { onDelete(task); closeTaskModal(); }
    });
  }
  sheet.querySelector('#tm-cancel').addEventListener('click', closeTaskModal);
  overlay.classList.remove('hidden');
  overlay.addEventListener('click', e => { if (e.target === overlay) closeTaskModal(); }, { once: true });
}

export function closeTaskModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ── Utilities ─────────────────────────────────────────────

function localDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function buildWeeklyRrule(due) {
  const days = ['SU','MO','TU','WE','TH','FR','SA'];
  if (due) {
    const day = days[new Date(due + 'T00:00:00').getDay()];
    return `FREQ=WEEKLY;BYDAY=${day}`;
  }
  return 'FREQ=WEEKLY';
}

function buildMonthlyRrule(due) {
  if (due) {
    const dom = new Date(due + 'T00:00:00').getDate();
    return `FREQ=MONTHLY;BYMONTHDAY=${dom}`;
  }
  return 'FREQ=MONTHLY';
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
