import { state } from '../app/state.js';
import { buildTaskItem } from '../components/taskItem.js';
import { parseTagsFromTitle, getAllCategories, visibleCategories, groupTasksByCategory } from '../app/taskUtils.js';
import { formatShortDate } from '../app/utils.js';

let _callbacks = null;

// Persist filter state across renders so toggling a task doesn't reset UI state
const _persist = {
  showDone: false,
  starredOnly: false,
  groupBy: 'date',
  filterCat: '',
  filterSource: '',
  sortOrder: null,  // null means use state.config.taskSortOrder
};

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

  const filterState = { showDone: _persist.showDone, starredOnly: _persist.starredOnly };
  let currentGroupBy   = _persist.groupBy;
  let currentFilterCat = _persist.filterCat;

  // ── Controls row ───────────────────────────────────────────
  const controls = document.createElement('div');
  controls.className = 'tasks-controls';

  const leftFilters = document.createElement('div');
  leftFilters.className = 'tasks-filters';

  const showDoneLabel = document.createElement('label');
  showDoneLabel.className = 'tasks-show-done';
  const showDoneCheck = document.createElement('input');
  showDoneCheck.type = 'checkbox';
  showDoneCheck.checked = _persist.showDone;
  showDoneCheck.addEventListener('change', () => {
    filterState.showDone = _persist.showDone = showDoneCheck.checked;
    rerender();
  });
  showDoneLabel.appendChild(showDoneCheck);
  showDoneLabel.appendChild(document.createTextNode(' Done'));

  const starredOnlyLabel = document.createElement('label');
  starredOnlyLabel.className = 'tasks-show-done';
  const starredOnlyCheck = document.createElement('input');
  starredOnlyCheck.type = 'checkbox';
  starredOnlyCheck.checked = _persist.starredOnly;
  starredOnlyCheck.addEventListener('change', () => {
    filterState.starredOnly = _persist.starredOnly = starredOnlyCheck.checked;
    rerender();
  });
  starredOnlyLabel.appendChild(starredOnlyCheck);
  starredOnlyLabel.appendChild(document.createTextNode(' ★'));
  starredOnlyLabel.title = 'Show starred tasks from all sources';

  leftFilters.appendChild(showDoneLabel);
  leftFilters.appendChild(starredOnlyLabel);

  const rightControls = document.createElement('div');
  rightControls.className = 'tasks-right-controls';

  const groupSel = document.createElement('select');
  groupSel.className = 'tasks-sort-select';
  groupSel.innerHTML = `
    <option value="date">Group: Date</option>
    <option value="category">Group: Category</option>
  `;
  groupSel.addEventListener('change', () => {
    currentGroupBy = _persist.groupBy = groupSel.value;
    rerender();
  });

  const sortSel = document.createElement('select');
  sortSel.className = 'tasks-sort-select';
  sortSel.innerHTML = `
    <option value="due">Sort: Due</option>
    <option value="starred">Sort: Starred</option>
    <option value="alpha">Sort: A–Z</option>
    <option value="created">Sort: Created</option>
  `;
  groupSel.value = _persist.groupBy;
  sortSel.value = _persist.sortOrder || state.config.taskSortOrder || 'due';
  sortSel.addEventListener('change', () => { _persist.sortOrder = sortSel.value; rerender(); });

  rightControls.appendChild(groupSel);
  rightControls.appendChild(sortSel);
  controls.appendChild(leftFilters);
  controls.appendChild(rightControls);

  // ── Source filter (only when multiple sources) ──────────────
  let currentSourceFilter = _persist.filterSource;
  const sourceFilterRow = document.createElement('div');
  sourceFilterRow.className = 'tasks-cat-filter-row';

  function buildSourceFilter() {
    sourceFilterRow.innerHTML = '';
    const sources = state.taskSources;
    if (!sources || sources.length < 2) return;

    const label = document.createElement('span');
    label.className = 'tasks-cat-filter-label';
    label.textContent = 'Source:';
    sourceFilterRow.appendChild(label);

    const allChip = document.createElement('button');
    allChip.className = 'tasks-cat-chip-filter' + (!currentSourceFilter ? ' active' : '');
    allChip.textContent = 'All';
    allChip.addEventListener('click', () => { currentSourceFilter = _persist.filterSource = ''; buildSourceFilter(); rerender(); });
    sourceFilterRow.appendChild(allChip);

    for (const src of sources) {
      const chip = document.createElement('button');
      chip.className = 'tasks-cat-chip-filter' + (currentSourceFilter === src.url ? ' active' : '');
      chip.textContent = src.name || src.url;
      chip.addEventListener('click', () => {
        currentSourceFilter = _persist.filterSource = (currentSourceFilter === src.url ? '' : src.url);
        buildSourceFilter();
        rerender();
      });
      sourceFilterRow.appendChild(chip);
    }
  }
  buildSourceFilter();

  // ── Category filter row ─────────────────────────────────────
  const catFilterRow = document.createElement('div');
  catFilterRow.className = 'tasks-cat-filter-row';

  function buildCatFilter() {
    catFilterRow.innerHTML = '';
    const hidden = state.config.hiddenCategories || [];
    const allCats = getAllCategories(state.tasks).filter(c => !hidden.includes(c));
    if (!allCats.length) return;

    const label = document.createElement('span');
    label.className = 'tasks-cat-filter-label';
    label.textContent = 'Filter:';
    catFilterRow.appendChild(label);

    const allChip = document.createElement('button');
    allChip.className = 'tasks-cat-chip-filter' + (!currentFilterCat ? ' active' : '');
    allChip.textContent = 'All';
    allChip.addEventListener('click', () => { currentFilterCat = _persist.filterCat = ''; buildCatFilter(); rerender(); });
    catFilterRow.appendChild(allChip);

    for (const cat of allCats) {
      const chip = document.createElement('button');
      chip.className = 'tasks-cat-chip-filter' + (currentFilterCat === cat ? ' active' : '');
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        currentFilterCat = _persist.filterCat = (currentFilterCat === cat ? '' : cat);
        buildCatFilter();
        rerender();
      });
      catFilterRow.appendChild(chip);
    }
  }
  buildCatFilter();

  // ── Task list ───────────────────────────────────────────────
  const list = document.createElement('div');
  list.className = 'tasks-list';

  function rerender() {
    buildSourceFilter();
    buildCatFilter();
    renderList(list, filterState, sortSel.value, currentGroupBy, currentFilterCat, currentSourceFilter, callbacks);
  }

  renderList(list, filterState, sortSel.value, currentGroupBy, currentFilterCat, currentSourceFilter, callbacks);

  const quickAdd = buildQuickAdd(callbacks);

  wrap.appendChild(controls);
  wrap.appendChild(sourceFilterRow);
  wrap.appendChild(catFilterRow);
  wrap.appendChild(list);
  wrap.appendChild(quickAdd);
  container.appendChild(wrap);
}

/** Focus the quick-add input (called when FAB is tapped in tasks view). */
export function focusTaskQuickAdd() {
  document.getElementById('task-quick-add-input')?.focus();
}

// ── List rendering ─────────────────────────────────────────

function renderList(container, filterState, sortOrder, groupBy, filterCat, filterSource, callbacks) {
  container.innerHTML = '';

  const hidden = state.config.hiddenCategories || [];
  let tasks = state.tasks.filter(t => filterState.showDone || t.status !== 'COMPLETED');
  if (filterState.starredOnly) tasks = tasks.filter(t => t.important);
  if (filterCat) tasks = tasks.filter(t => (t.categories || []).includes(filterCat));
  // Starred view shows all sources — ignore source filter when starred is active
  if (filterSource && !filterState.starredOnly) tasks = tasks.filter(t => t.source === filterSource);
  tasks = sortTasks(tasks, sortOrder);

  if (groupBy === 'category') {
    renderByCategoryGroups(container, tasks, hidden, callbacks);
  } else {
    renderByDateGroups(container, tasks, callbacks);
  }
}

function renderByDateGroups(container, tasks, callbacks) {
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
  if (overdue.length)       groups.push({ key: 'overdue',  label: 'Overdue',   overdue: true, items: overdue });
  if (todayItems.length)    groups.push({ key: 'today',    label: 'Today',     items: todayItems });
  if (tomorrowItems.length) groups.push({ key: 'tomorrow', label: 'Tomorrow',  items: tomorrowItems });
  for (const [date, items] of [...byDate.entries()].sort()) {
    groups.push({ key: date, label: formatDateHeader(date), items });
  }
  if (noDue.length) groups.push({ key: 'none', label: 'No due date', items: noDue });

  renderGroups(container, groups, callbacks, tasks.length, false);
}

function renderByCategoryGroups(container, tasks, hidden, callbacks) {
  const grouped = groupTasksByCategory(tasks, hidden);
  const groups = [];
  for (const [key, items] of grouped) {
    groups.push({ key: key || '__none__', label: key || 'Uncategorized', items });
  }
  renderGroups(container, groups, callbacks, tasks.length, true);
}

function renderGroups(container, groups, callbacks, totalCount, showDue = false) {
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
        onSnooze:   t => callbacks.onSnooze?.(t),
        showDue,
      }));
    }
    section.appendChild(ul);
    container.appendChild(section);
  }

  if (isEmpty) {
    const empty = document.createElement('p');
    empty.className = 'tasks-empty';
    empty.textContent = totalCount ? 'All done! ✓' : 'No tasks yet — add one below.';
    container.appendChild(empty);
  }
}

function sortTasks(tasks, order) {
  const copy = [...tasks];
  if (order === 'alpha') return copy.sort((a, b) => a.title.localeCompare(b.title));
  if (order === 'created') return copy.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
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
  return copy.sort((a, b) => {
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });
}

// ── Quick-add bar ──────────────────────────────────────────

function buildQuickAdd(callbacks) {
  const bar = document.createElement('div');
  bar.className = 'tasks-quickadd';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'tasks-quickadd-input-wrap';
  inputWrap.style.position = 'relative';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'task-quick-add-input';
  input.className = 'tasks-quickadd-input';
  input.placeholder = 'Add a task… e.g. "buy milk tomorrow #groceries"';

  const autocompleteList = document.createElement('ul');
  autocompleteList.className = 'tasks-autocomplete';
  autocompleteList.style.display = 'none';

  function getCurrentHashWord() {
    const val = input.value;
    const pos = input.selectionStart;
    const before = val.slice(0, pos);
    const m = before.match(/#(\S*)$/);
    return m ? { word: m[0], partial: m[1], start: pos - m[0].length } : null;
  }

  function showAutocomplete() {
    const hw = getCurrentHashWord();
    if (!hw) { autocompleteList.style.display = 'none'; return; }
    const hidden = state.config.hiddenCategories || [];
    const cats = getAllCategories(state.tasks)
      .filter(c => !hidden.includes(c) && c.startsWith(hw.partial.toLowerCase()));
    if (!cats.length) { autocompleteList.style.display = 'none'; return; }

    autocompleteList.innerHTML = '';
    for (const cat of cats.slice(0, 8)) {
      const li = document.createElement('li');
      li.textContent = cat;
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        const hw2 = getCurrentHashWord();
        if (!hw2) return;
        const val = input.value;
        input.value = val.slice(0, hw2.start) + '#' + cat + ' ' + val.slice(hw2.start + hw2.word.length);
        input.focus();
        autocompleteList.style.display = 'none';
      });
      autocompleteList.appendChild(li);
    }
    autocompleteList.style.display = '';
  }

  input.addEventListener('input', showAutocomplete);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { autocompleteList.style.display = 'none'; }
    if (e.key === 'Enter') { autocompleteList.style.display = 'none'; submit(); }
  });
  input.addEventListener('blur', () => { setTimeout(() => { autocompleteList.style.display = 'none'; }, 150); });

  inputWrap.appendChild(input);
  inputWrap.appendChild(autocompleteList);

  const dates = document.createElement('div');
  dates.className = 'tasks-quickadd-dates';

  let selectedDue = null;
  const today    = localDateString(new Date());
  const tomorrow = localDateString(new Date(Date.now() + 86400000));

  function makeShortcut(label, value) {
    const btn = document.createElement('button');
    btn.className = 'tasks-date-shortcut';
    btn.textContent = label;
    btn.addEventListener('click', () => { selectedDue = selectedDue === value ? null : value; updateActive(); });
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
    if (datePicker.value) { selectedDue = datePicker.value; updateActive(); }
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

  // Source selector (only shown when multiple sources configured)
  let selectedSource = null;
  const sourceRow = document.createElement('div');
  sourceRow.className = 'tasks-quickadd-dates';
  sourceRow.style.display = 'none';

  function buildSourceSelector() {
    const sources = state.taskSources;
    if (!sources || sources.length < 2) { sourceRow.style.display = 'none'; return; }
    sourceRow.style.display = '';
    sourceRow.innerHTML = '';
    const lbl = document.createElement('span');
    lbl.className = 'tasks-cat-filter-label';
    lbl.textContent = 'To:';
    sourceRow.appendChild(lbl);
    for (const src of sources) {
      const btn = document.createElement('button');
      btn.className = 'tasks-date-shortcut' + (selectedSource === src.url ? ' active' : '');
      btn.textContent = src.name || src.url;
      btn.addEventListener('click', () => {
        selectedSource = selectedSource === src.url ? null : src.url;
        buildSourceSelector();
      });
      sourceRow.appendChild(btn);
    }
  }
  buildSourceSelector();

  async function submit() {
    const raw = input.value.trim();
    if (!raw) return;
    const { title: rawTitle, tags } = parseTagsFromTitle(raw);
    if (!rawTitle) { input.value = ''; return; }
    input.value = '';
    const source = selectedSource || undefined;

    // If user has selected a specific due date, use it and skip NLP date parsing
    if (selectedDue) {
      const due = selectedDue;
      selectedDue = null;
      updateActive();
      await callbacks.onAdd({ title: rawTitle, due, categories: tags.length ? tags : undefined, source });
      return;
    }
    selectedDue = null;
    updateActive();

    // Run NLP to extract date and recurrence from the title
    try {
      const res = await fetch('/nlp/parse-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawTitle }),
      });
      const nlp = await res.json();
      if (nlp.parsed) {
        await callbacks.onAdd({
          title: nlp.title || rawTitle,
          due: nlp.due || null,
          categories: tags.length ? tags : undefined,
          rrule: nlp.rrule || undefined,
          xRecurringType: nlp.xRecurringType || undefined,
          xRecurringInterval: nlp.xRecurringInterval || undefined,
          source,
        });
      } else {
        await callbacks.onAdd({ title: rawTitle, due: null, categories: tags.length ? tags : undefined, source });
      }
    } catch {
      await callbacks.onAdd({ title: rawTitle, due: null, categories: tags.length ? tags : undefined, source });
    }
  }

  const submitBtn = document.createElement('button');
  submitBtn.className = 'tasks-quickadd-submit';
  submitBtn.textContent = '↵';
  submitBtn.setAttribute('aria-label', 'Quick add task');
  submitBtn.addEventListener('click', submit);

  const newBtn = document.createElement('button');
  newBtn.className = 'tasks-quickadd-new';
  newBtn.textContent = '+';
  newBtn.setAttribute('aria-label', 'New task (full form)');
  newBtn.addEventListener('click', () => {
    openTaskModal({}, { onSave: data => callbacks.onAdd(data), onDelete: () => {} });
  });

  const row = document.createElement('div');
  row.className = 'tasks-quickadd-row';
  row.appendChild(inputWrap);
  row.appendChild(submitBtn);
  row.appendChild(newBtn);

  bar.appendChild(row);
  bar.appendChild(dates);
  bar.appendChild(sourceRow);
  return bar;
}

// ── Task edit modal ────────────────────────────────────────

export function openTaskModal(task, { onSave, onDelete }) {
  const overlay = document.getElementById('modal-overlay');
  const sheet = overlay.querySelector('.modal-sheet');

  const isRecAfterCompletion = task.recurringType === 'after-completion';
  const isRecRrule = task.recurringType === 'rrule';
  const isCompleted = task.status === 'COMPLETED';

  const hidden = state.config.hiddenCategories || [];
  const existingCats = getAllCategories(state.tasks).filter(c => !hidden.includes(c));
  const taskCats = visibleCategories(task.categories || [], hidden);

  sheet.innerHTML = `
    <div class="modal-handle"></div>

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
      <label>Categories</label>
      <div class="tm-cats-combined">
        <div id="tm-cats-chips" class="tm-cats-chips-inline">
          ${taskCats.map(c => `<span class="task-cat-chip tm-cat-chip-rm" data-cat="${esc(c)}">${esc(c)} ×</span>`).join('')}
        </div>
        <input type="text" id="tm-cat-input" placeholder="Add category…" autocomplete="off">
        <button type="button" id="tm-cat-add" class="btn btn-ghost tm-cat-add-btn">+</button>
        <ul class="tasks-autocomplete tm-cat-autocomplete" style="display:none"></ul>
      </div>
    </div>

    <div class="modal-row tm-repeat-complete-row">
      <div class="modal-field">
        <label>Repeat</label>
        <select id="tm-recurring">
          <option value="">None</option>
          <option value="rrule-daily"   ${isRecRrule && task.rrule?.includes('DAILY')   ? 'selected' : ''}>Daily</option>
          <option value="rrule-weekly"  ${isRecRrule && task.rrule?.includes('WEEKLY')  ? 'selected' : ''}>Weekly</option>
          <option value="rrule-monthly" ${isRecRrule && task.rrule?.includes('MONTHLY') ? 'selected' : ''}>Monthly</option>
          <option value="after-custom"  ${isRecAfterCompletion ? 'selected' : ''}>After completion</option>
        </select>
      </div>
      <div class="modal-field modal-field-checkbox tm-complete-col">
        <label>
          <input type="checkbox" id="tm-completed" ${isCompleted ? 'checked' : ''}>
          Completed
        </label>
      </div>
    </div>

    <div class="modal-field" id="tm-interval-field" style="${isRecAfterCompletion ? '' : 'display:none'}">
      <label>Interval (e.g. 3d, 2w)</label>
      <input type="text" id="tm-interval" value="${esc(task.recurringInterval || '')}" placeholder="e.g. 3d, 2w">
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary" id="tm-save">Save</button>
      ${task.uid ? '<button class="btn btn-ghost" id="tm-delete" style="color:var(--color-danger)">Delete</button>' : ''}
      <button class="btn btn-ghost" id="tm-cancel">Cancel</button>
    </div>
  `;

  // Track categories in modal as mutable array
  const modalCats = [...taskCats];

  function renderCatChips() {
    const chipsEl = sheet.querySelector('#tm-cats-chips');
    chipsEl.innerHTML = '';
    for (const c of modalCats) {
      const chip = document.createElement('span');
      chip.className = 'task-cat-chip tm-cat-chip-rm';
      chip.textContent = c + ' ×';
      chip.dataset.cat = c;
      chip.addEventListener('click', () => {
        const idx = modalCats.indexOf(c);
        if (idx !== -1) modalCats.splice(idx, 1);
        renderCatChips();
      });
      chipsEl.appendChild(chip);
    }
  }
  // Wire up existing chip remove buttons from innerHTML
  sheet.querySelectorAll('.tm-cat-chip-rm').forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.cat;
      const idx = modalCats.indexOf(cat);
      if (idx !== -1) modalCats.splice(idx, 1);
      renderCatChips();
    });
  });

  function addCategory(cat) {
    const c = cat.trim().toLowerCase();
    if (c && !modalCats.includes(c)) { modalCats.push(c); renderCatChips(); }
  }

  // Category autocomplete dropdown
  const catInput = sheet.querySelector('#tm-cat-input');
  const catAutoList = sheet.querySelector('.tm-cat-autocomplete');

  function showCatAutocomplete() {
    const q = catInput.value.trim().toLowerCase();
    const matches = existingCats.filter(c => !modalCats.includes(c) && c.startsWith(q));
    if (!matches.length) { catAutoList.style.display = 'none'; return; }
    catAutoList.innerHTML = '';
    for (const cat of matches.slice(0, 8)) {
      const li = document.createElement('li');
      li.textContent = cat;
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        addCategory(cat);
        catInput.value = '';
        catAutoList.style.display = 'none';
      });
      catAutoList.appendChild(li);
    }
    catAutoList.style.display = '';
  }

  catInput.addEventListener('input', showCatAutocomplete);
  catInput.addEventListener('blur', () => setTimeout(() => { catAutoList.style.display = 'none'; }, 150));

  sheet.querySelector('#tm-cat-add').addEventListener('click', () => {
    addCategory(catInput.value);
    catInput.value = '';
    catAutoList.style.display = 'none';
  });
  catInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory(catInput.value);
      catInput.value = '';
      catAutoList.style.display = 'none';
    }
    if (e.key === 'Escape') catAutoList.style.display = 'none';
  });

  sheet.querySelector('#tm-recurring').addEventListener('change', e => {
    sheet.querySelector('#tm-interval-field').style.display = e.target.value === 'after-custom' ? '' : 'none';
  });

  sheet.querySelector('#tm-save').addEventListener('click', () => {
    const title = sheet.querySelector('#tm-title').value.trim();
    if (!title) { alert('Title is required'); return; }

    const recurringVal = sheet.querySelector('#tm-recurring').value;
    let rrule = null, xRecurringType = null, xRecurringInterval = null;
    if (recurringVal === 'rrule-daily')     rrule = 'FREQ=DAILY';
    else if (recurringVal === 'rrule-weekly')   rrule = buildWeeklyRrule(sheet.querySelector('#tm-due').value);
    else if (recurringVal === 'rrule-monthly')  rrule = buildMonthlyRrule(sheet.querySelector('#tm-due').value);
    else if (recurringVal === 'after-custom') {
      xRecurringType = 'after-completion';
      xRecurringInterval = sheet.querySelector('#tm-interval').value.trim() || 'weekly';
    }

    const completedChecked = sheet.querySelector('#tm-completed').checked;
    const important = (task.categories || []).includes('important');
    const finalCats = important ? [...modalCats, 'important'] : [...modalCats];

    onSave({
      title,
      due:         sheet.querySelector('#tm-due').value || null,
      description: sheet.querySelector('#tm-desc').value.trim(),
      categories:  finalCats,
      status:      completedChecked ? 'COMPLETED' : 'NEEDS-ACTION',
      completed:   completedChecked ? new Date().toISOString() : null,
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

// ── Utilities ──────────────────────────────────────────────

function localDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday} ${formatShortDate(d, state.config.dateFormat || 'dmy')}`;
}

function buildWeeklyRrule(due) {
  const days = ['SU','MO','TU','WE','TH','FR','SA'];
  if (due) return `FREQ=WEEKLY;BYDAY=${days[new Date(due + 'T00:00:00').getDay()]}`;
  return 'FREQ=WEEKLY';
}

function buildMonthlyRrule(due) {
  if (due) return `FREQ=MONTHLY;BYMONTHDAY=${new Date(due + 'T00:00:00').getDate()}`;
  return 'FREQ=MONTHLY';
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
