import { state } from '../app/state.js';
import { buildTaskItem } from '../components/taskItem.js';
import { parseTagsFromTitle, getAllCategories, visibleCategories, groupTasksByCategory, taskSourceVisible } from '../app/taskUtils.js';
import { formatShortDate, localDateStr } from '../app/utils.js';
import { openTaskModal } from '../components/taskModal.js';
import { mountTaskQuickAdd, destroyTaskQuickAdd, focusTaskQuickAdd } from '../components/taskQuickAdd.js';

let _callbacks = null;

// Persist filter state across renders so toggling a task doesn't reset UI state
const _persist = {
  showDone: false,
  starredOnly: false,
  groupBy: 'date',
  filterCat: '',
  filterSource: '',
  query: '',
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

  // ── Search box ──────────────────────────────────────────────
  // Searches title + description across the source-visible tasks (i.e. the
  // calendars currently checked in the drawer). Created once so typing keeps
  // focus — rerender() never rebuilds this input.
  const searchRow = document.createElement('div');
  searchRow.className = 'tasks-search-row';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'tasks-search-input';
  searchInput.placeholder = 'Search tasks…';
  searchInput.value = _persist.query;
  searchInput.addEventListener('input', () => {
    _persist.query = searchInput.value;
    renderList(list, filterState, sortSel.value, currentGroupBy, currentFilterCat, currentSourceFilter, callbacks);
  });
  searchRow.appendChild(searchInput);

  // ── Source filter (only when multiple sources) ──────────────
  let currentSourceFilter = _persist.filterSource;
  const sourceFilterRow = document.createElement('div');
  sourceFilterRow.className = 'tasks-cat-filter-row';

  function buildSourceFilter() {
    sourceFilterRow.innerHTML = '';
    // Only offer sources whose calendar is active in the current profile —
    // a deactivated calendar (hidden via drawer/profile) hides its tasks too.
    const sources = (state.taskSources || []).filter(s => !state.hiddenCalendars.has(s.url));
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
    const sourceVisible = state.tasks.filter(t => taskSourceVisible(t, state.hiddenCalendars));
    const allCats = getAllCategories(sourceVisible).filter(c => !hidden.includes(c));
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

  wrap.appendChild(controls);
  wrap.appendChild(searchRow);
  wrap.appendChild(sourceFilterRow);
  wrap.appendChild(catFilterRow);
  wrap.appendChild(list);
  container.appendChild(wrap);

  mountTaskQuickAdd(callbacks);
}

// ── List rendering ─────────────────────────────────────────

function renderList(container, filterState, sortOrder, groupBy, filterCat, filterSource, callbacks) {
  container.innerHTML = '';

  const hidden = state.config.hiddenCategories || [];
  // Tasks from calendars deactivated in the current profile are not surfaced.
  let visibleTasks = state.tasks.filter(t => taskSourceVisible(t, state.hiddenCalendars));
  // Free-text search over the source-visible set: title + description.
  const query = (_persist.query || '').trim().toLowerCase();
  if (query) {
    visibleTasks = visibleTasks.filter(t =>
      (t.title || '').toLowerCase().includes(query) ||
      (t.description || '').toLowerCase().includes(query)
    );
  }
  let tasks;
  if (filterState.showDone) {
    // "Done" mode: show ONLY completed tasks, newest completion first
    tasks = visibleTasks.filter(t => t.status === 'COMPLETED');
    if (filterState.starredOnly) tasks = tasks.filter(t => t.important); // AND: done AND starred
    if (filterCat) tasks = tasks.filter(t => (t.categories || []).includes(filterCat));
    if (filterSource) tasks = tasks.filter(t => t.source === filterSource);
    tasks = [...tasks].sort((a, b) => (b.completed || '').localeCompare(a.completed || ''));
  } else {
    tasks = visibleTasks.filter(t => t.status !== 'COMPLETED');
    if (filterState.starredOnly) tasks = tasks.filter(t => t.important);
    if (filterCat) tasks = tasks.filter(t => (t.categories || []).includes(filterCat));
    if (filterSource) tasks = tasks.filter(t => t.source === filterSource);
    tasks = sortTasks(tasks, sortOrder);
  }

  if (filterState.showDone) {
    renderByCompletionGroups(container, tasks, callbacks);
  } else if (groupBy === 'category') {
    renderByCategoryGroups(container, tasks, hidden, callbacks);
  } else {
    renderByDateGroups(container, tasks, callbacks);
  }
}

function renderByDateGroups(container, tasks, callbacks) {
  const today    = localDateStr(new Date());
  const tomorrow = localDateStr(new Date(Date.now() + 86400000));

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
  if (todayItems.length)    groups.push({ key: 'today',    label: `Today · ${formatDateHeader(today)}`,         items: todayItems });
  if (tomorrowItems.length) groups.push({ key: 'tomorrow', label: `Tomorrow · ${formatDateHeader(tomorrow)}`,   items: tomorrowItems });
  for (const [date, items] of [...byDate.entries()].sort()) {
    groups.push({ key: date, label: formatDateHeader(date), items });
  }
  if (noDue.length) groups.push({ key: 'none', label: 'No due date', items: noDue });

  renderGroups(container, groups, callbacks, tasks.length, false);
}

function renderByCompletionGroups(container, tasks, callbacks) {
  const byDate = new Map();
  const noDate = [];
  for (const task of tasks) {
    const dateStr = task.completed ? task.completed.slice(0, 10) : null;
    if (!dateStr) { noDate.push(task); continue; }
    if (!byDate.has(dateStr)) byDate.set(dateStr, []);
    byDate.get(dateStr).push(task);
  }
  const groups = [];
  for (const [date, items] of [...byDate.entries()].sort().reverse()) {
    groups.push({ key: date, label: formatDateHeader(date), items });
  }
  if (noDate.length) groups.push({ key: 'none', label: 'No completion date', items: noDate });
  renderGroups(container, groups, callbacks, tasks.length, true); // showDue=true: show due date on each card
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
    if (_persist.query.trim()) {
      empty.textContent = 'No search results for your query.';
    } else {
      empty.textContent = totalCount ? 'All done! ✓' : 'No tasks yet — add one below.';
    }
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

// ── Utilities ──────────────────────────────────────────────

function formatDateHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday} ${formatShortDate(d, state.config.dateFormat || 'dmy')}`;
}
