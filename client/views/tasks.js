import { state } from '../app/state.js';
import { buildTaskItem } from '../components/taskItem.js';
import {
  getAllCategories,
  groupTasksByCategory,
  priorityRank,
  taskSourceVisible,
} from '../app/taskUtils.js';
import { formatShortDate, localDateStr } from '../app/utils.js';
import { mountTaskQuickAdd, syncTaskQuickAddBoardFilters } from '../components/taskQuickAdd.js';
import { renderTaskBoard } from './taskBoard.js';
import { compareManual } from '../app/manualOrder.js';
import { boardForLayout, buildLayoutSelect, readStoredLayout, storeLayout } from './taskLayout.js';
import { readTaskViewPrefs, storeTaskViewPrefs } from './taskViewPrefs.js';

// tasks-filter-row: folded behind Options on landscape phones and portrait boards (tasks.css).
const FILTER_ROW_CLASSES =
  'tasks-filter-row flex shrink-0 items-center gap-xs overflow-x-auto border-b border-border px-md py-xs [scrollbar-width:none] empty:hidden';
const LIST_CLASSES = 'tasks-list min-h-0 flex-1 overflow-y-auto pb-sm';
// The board scrolls itself in both directions; the list around it must not.
const BOARD_LIST_CLASSES = 'tasks-list min-h-0 flex-1 overflow-hidden';
const FILTER_CHIP_CLASSES =
  'shrink-0 whitespace-nowrap rounded-lg border border-border px-control py-pill-y text-sm text-text-muted transition-colors duration-100 aria-pressed:border-accent aria-pressed:bg-accent-light aria-pressed:text-accent';

// Persist filter state across renders so toggling a task doesn't reset UI state
const initialLayout = readStoredLayout();
const _persist = {
  showDone: false,
  groupBy: initialLayout,
  ...readTaskViewPrefs(initialLayout),
  query: '',
  filtersOpen: false,
};

/**
 * Render the tasks view.
 * @param {HTMLElement} container
 * @param {object} callbacks - { onComplete, onStar, onAdd, onEdit, onDelete }
 */
export function renderTasks(container, callbacks) {
  // A board removed in Settings cannot keep its filters active on the list.
  if (
    _persist.groupBy !== 'date' &&
    _persist.groupBy !== 'category' &&
    !boardForLayout(_persist.groupBy)
  ) {
    _persist.groupBy = 'date';
    Object.assign(_persist, readTaskViewPrefs('date'));
  }
  // Completing/starring a task re-renders the whole view — keep the reading position.
  const prevScrollTop = container.querySelector('.tasks-list')?.scrollTop || 0;
  container.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'tasks-view flex h-full flex-col overflow-hidden';
  wrap.classList.toggle('filters-open', _persist.filtersOpen);
  wrap.classList.toggle('is-board', !!boardForLayout(_persist.groupBy));

  const filterState = { showDone: _persist.showDone, starredOnly: _persist.starredOnly };
  let currentGroupBy = _persist.groupBy;
  let currentFilterCat = _persist.filterCat;

  function rememberPrefs() {
    storeTaskViewPrefs(currentGroupBy, {
      filterCat: currentFilterCat,
      filterSource: currentSourceFilter,
      starredOnly: filterState.starredOnly,
      sortOrder: _persist.sortOrder,
    });
  }

  function quickAddOptions() {
    const board = boardForLayout(currentGroupBy);
    if (!board) return {};
    const options = {
      getFilters: () => ({ source: currentSourceFilter, category: currentFilterCat }),
    };
    if (board.columns === 'status' || board.lanes === 'status') {
      return { ...options, statusBoardId: board.id };
    }
    return options;
  }

  // ── Controls row ───────────────────────────────────────────
  const controls = document.createElement('div');
  controls.className =
    'tasks-controls flex shrink-0 items-center justify-between gap-sm border-b border-border px-md py-sm';

  const leftFilters = document.createElement('div');
  leftFilters.className = 'tasks-left-filters flex items-center gap-md';

  const showDoneLabel = document.createElement('label');
  showDoneLabel.className = 'flex cursor-pointer items-center gap-sm text-sm text-text-muted';
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
  starredOnlyLabel.className =
    'tasks-starred-only flex cursor-pointer items-center gap-sm text-sm text-text-muted';
  const starredOnlyCheck = document.createElement('input');
  starredOnlyCheck.type = 'checkbox';
  starredOnlyCheck.checked = _persist.starredOnly;
  starredOnlyCheck.addEventListener('change', () => {
    filterState.starredOnly = _persist.starredOnly = starredOnlyCheck.checked;
    rememberPrefs();
    rerender();
  });
  starredOnlyLabel.appendChild(starredOnlyCheck);
  starredOnlyLabel.appendChild(document.createTextNode(' ★'));
  starredOnlyLabel.title = 'Show starred tasks from all sources';

  leftFilters.appendChild(showDoneLabel);
  leftFilters.appendChild(starredOnlyLabel);

  // Shown where the search and filter rows are folded away.
  const filtersToggle = document.createElement('button');
  filtersToggle.type = 'button';
  filtersToggle.className =
    'tasks-filters-toggle shrink-0 whitespace-nowrap rounded-lg border border-border px-control py-pill-y text-sm text-text-muted transition-colors duration-100 aria-expanded:border-accent aria-expanded:bg-accent-light aria-expanded:text-accent';
  filtersToggle.addEventListener('click', function toggleFilterRows() {
    _persist.filtersOpen = !_persist.filtersOpen;
    wrap.classList.toggle('filters-open', _persist.filtersOpen);
    updateFiltersToggle();
  });
  leftFilters.appendChild(filtersToggle);

  // Hidden choices can still change the board, so the button counts them.
  function updateFiltersToggle() {
    let active = 0;
    if (_persist.query.trim()) active += 1;
    if (currentSourceFilter) active += 1;
    if (currentFilterCat) active += 1;
    if (filterState.starredOnly) active += 1;
    if (sortSel.value !== (state.config.taskSortOrder || 'due')) active += 1;
    let label = 'Options';
    if (active) label = `Options · ${active}`;
    filtersToggle.textContent = label;
    filtersToggle.setAttribute('aria-expanded', String(_persist.filtersOpen));
  }

  const rightControls = document.createElement('div');
  rightControls.className = 'tasks-right-controls flex items-center gap-sm';

  const groupSel = buildLayoutSelect();
  groupSel.classList.add('tasks-layout-control');
  groupSel.addEventListener('change', () => {
    currentGroupBy = _persist.groupBy = groupSel.value;
    storeLayout(groupSel.value);
    Object.assign(_persist, readTaskViewPrefs(currentGroupBy));
    filterState.starredOnly = starredOnlyCheck.checked = _persist.starredOnly;
    currentFilterCat = _persist.filterCat;
    currentSourceFilter = _persist.filterSource;
    sortSel.value = _persist.sortOrder || state.config.taskSortOrder || 'due';
    showDoneLabel.hidden = !!boardForLayout(currentGroupBy);
    wrap.classList.toggle('is-board', !!boardForLayout(currentGroupBy));
    rerender();
    if (callbacks.onAdd) mountTaskQuickAdd(callbacks, quickAddOptions());
  });

  const sortSel = document.createElement('select');
  sortSel.className = 'tasks-sort-control rounded-sm px-sm py-xs text-sm';
  sortSel.innerHTML = `
    <option value="due">Sort: Due</option>
    <option value="starred">Sort: Starred</option>
    <option value="priority">Sort: Priority</option>
    <option value="alpha">Sort: A–Z</option>
    <option value="created">Sort: Created</option>
    <option value="manual">Sort: Manual</option>
  `;
  groupSel.value = currentGroupBy;
  // A board has its own Done column; the list's done-only mode does not apply.
  showDoneLabel.hidden = !!boardForLayout(currentGroupBy);
  sortSel.value = _persist.sortOrder || state.config.taskSortOrder || 'due';
  sortSel.addEventListener('change', () => {
    _persist.sortOrder = sortSel.value;
    rememberPrefs();
    rerender();
  });

  rightControls.appendChild(groupSel);
  rightControls.appendChild(sortSel);
  controls.appendChild(leftFilters);
  controls.appendChild(rightControls);

  // ── Search box ──────────────────────────────────────────────
  // Searches title + description across the source-visible tasks (i.e. the
  // calendars currently checked in the drawer). Created once so typing keeps
  // focus — rerender() never rebuilds this input.
  const searchRow = document.createElement('div');
  searchRow.className =
    'tasks-search-row tasks-filter-row shrink-0 border-b border-border px-md py-xs';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'w-full rounded-sm border border-border px-control py-field-y text-sm';
  searchInput.placeholder = 'Search tasks…';
  searchInput.value = _persist.query;

  const inlineSearchInput = document.createElement('input');
  inlineSearchInput.type = 'search';
  inlineSearchInput.className =
    'tasks-inline-search rounded-sm border border-border px-control py-field-y text-sm';
  inlineSearchInput.setAttribute('aria-label', 'Search tasks');
  inlineSearchInput.placeholder = 'Search…';
  inlineSearchInput.value = _persist.query;
  controls.classList.toggle('search-open', !!_persist.query.trim());
  inlineSearchInput.addEventListener('focus', () => controls.classList.add('search-open'));
  inlineSearchInput.addEventListener('blur', () => {
    if (!_persist.query.trim()) controls.classList.remove('search-open');
  });

  function setQuery(value) {
    _persist.query = value;
    searchInput.value = value;
    inlineSearchInput.value = value;
    controls.classList.toggle(
      'search-open',
      !!value.trim() || document.activeElement === inlineSearchInput,
    );
    updateFiltersToggle();
    renderList(
      list,
      filterState,
      sortSel.value,
      currentGroupBy,
      currentFilterCat,
      currentSourceFilter,
      callbacks,
    );
  }
  searchInput.addEventListener('input', () => setQuery(searchInput.value));
  inlineSearchInput.addEventListener('input', () => setQuery(inlineSearchInput.value));
  controls.appendChild(inlineSearchInput);
  searchRow.appendChild(searchInput);

  // ── Source filter (only when multiple sources) ──────────────
  let currentSourceFilter = _persist.filterSource;
  const sourceFilterRow = document.createElement('div');
  sourceFilterRow.className = FILTER_ROW_CLASSES;

  function buildSourceFilter() {
    sourceFilterRow.innerHTML = '';
    // Only offer sources whose calendar is active in the current profile —
    // a deactivated calendar (hidden via drawer/profile) hides its tasks too.
    const sources = (state.taskSources || []).filter((s) => !state.hiddenCalendars.has(s.url));
    if (sources.length < 2 && !currentSourceFilter) return;

    const label = document.createElement('span');
    label.className = 'shrink-0 text-sm text-text-muted';
    label.textContent = 'Source:';
    sourceFilterRow.appendChild(label);

    const allChip = document.createElement('button');
    allChip.className = FILTER_CHIP_CLASSES;
    allChip.setAttribute('aria-pressed', String(!currentSourceFilter));
    allChip.textContent = 'All';
    allChip.addEventListener('click', () => {
      currentSourceFilter = _persist.filterSource = '';
      rememberPrefs();
      buildSourceFilter();
      rerender();
    });
    sourceFilterRow.appendChild(allChip);

    for (const src of sources) {
      const chip = document.createElement('button');
      chip.className = FILTER_CHIP_CLASSES;
      chip.setAttribute('aria-pressed', String(currentSourceFilter === src.url));
      chip.textContent = src.name || src.url;
      chip.addEventListener('click', () => {
        currentSourceFilter = _persist.filterSource =
          currentSourceFilter === src.url ? '' : src.url;
        rememberPrefs();
        buildSourceFilter();
        rerender();
      });
      sourceFilterRow.appendChild(chip);
    }
  }
  buildSourceFilter();

  // ── Category filter row ─────────────────────────────────────
  const catFilterRow = document.createElement('div');
  catFilterRow.className = FILTER_ROW_CLASSES;

  function buildCatFilter() {
    catFilterRow.innerHTML = '';
    const hidden = state.config.hiddenCategories || [];
    const sourceVisible = state.tasks.filter((t) => taskSourceVisible(t, state.hiddenCalendars));
    const allCats = getAllCategories(sourceVisible).filter((c) => !hidden.includes(c));
    if (!allCats.length && !currentFilterCat) return;

    const label = document.createElement('span');
    label.className = 'shrink-0 text-sm text-text-muted';
    label.textContent = 'Filter:';
    catFilterRow.appendChild(label);

    const allChip = document.createElement('button');
    allChip.className = FILTER_CHIP_CLASSES;
    allChip.setAttribute('aria-pressed', String(!currentFilterCat));
    allChip.textContent = 'All';
    allChip.addEventListener('click', () => {
      currentFilterCat = _persist.filterCat = '';
      rememberPrefs();
      buildCatFilter();
      rerender();
    });
    catFilterRow.appendChild(allChip);

    for (const cat of allCats) {
      const chip = document.createElement('button');
      chip.className = FILTER_CHIP_CLASSES;
      chip.setAttribute('aria-pressed', String(currentFilterCat === cat));
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        currentFilterCat = _persist.filterCat = currentFilterCat === cat ? '' : cat;
        rememberPrefs();
        buildCatFilter();
        rerender();
      });
      catFilterRow.appendChild(chip);
    }
  }
  buildCatFilter();

  // ── Task list ───────────────────────────────────────────────
  const list = document.createElement('div');
  list.className = LIST_CLASSES;

  function rerender() {
    buildSourceFilter();
    buildCatFilter();
    updateFiltersToggle();
    syncTaskQuickAddBoardFilters();
    renderList(
      list,
      filterState,
      sortSel.value,
      currentGroupBy,
      currentFilterCat,
      currentSourceFilter,
      callbacks,
    );
  }

  updateFiltersToggle();
  renderList(
    list,
    filterState,
    sortSel.value,
    currentGroupBy,
    currentFilterCat,
    currentSourceFilter,
    callbacks,
  );

  wrap.appendChild(controls);
  wrap.appendChild(searchRow);
  wrap.appendChild(sourceFilterRow);
  wrap.appendChild(catFilterRow);
  wrap.appendChild(list);
  container.appendChild(wrap);
  // Browser clamps to the new content height if the list got shorter.
  if (prevScrollTop) list.scrollTop = prevScrollTop;

  if (callbacks.onAdd) mountTaskQuickAdd(callbacks, quickAddOptions());
}

// ── List rendering ─────────────────────────────────────────

function renderList(
  container,
  filterState,
  sortOrder,
  groupBy,
  filterCat,
  filterSource,
  callbacks,
) {
  container.innerHTML = '';
  const board = boardForLayout(groupBy);
  if (board) {
    container.className = BOARD_LIST_CLASSES;
  } else {
    container.className = LIST_CLASSES;
  }

  const hidden = state.config.hiddenCategories || [];
  // Tasks from calendars deactivated in the current profile are not surfaced.
  const sourceVisibleTasks = state.tasks.filter((t) => taskSourceVisible(t, state.hiddenCalendars));
  let visibleTasks = sourceVisibleTasks;
  // Free-text search over the source-visible set: title + description.
  const query = (_persist.query || '').trim().toLowerCase();
  if (query) {
    visibleTasks = visibleTasks.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(query) ||
        (t.description || '').toLowerCase().includes(query),
    );
  }
  // Starred, category and source chips narrow every layout alike (AND).
  if (filterState.starredOnly) visibleTasks = visibleTasks.filter((t) => t.important);
  if (filterCat)
    visibleTasks = visibleTasks.filter((t) => (t.categories || []).includes(filterCat));
  if (filterSource) visibleTasks = visibleTasks.filter((t) => t.source === filterSource);

  if (board) {
    // The board decides which completed tasks it shows (a status board's Done column).
    const ordered = sortOrder === 'manual';
    renderTaskBoard(
      container,
      sortTasks(visibleTasks, sortOrder),
      board,
      callbacks,
      ordered,
      sourceVisibleTasks,
      { source: filterSource, category: filterCat },
    );
    return;
  }

  let tasks;
  if (filterState.showDone) {
    // "Done" mode: show ONLY completed tasks, newest completion first
    tasks = visibleTasks.filter((t) => t.status === 'COMPLETED');
    tasks = [...tasks].sort((a, b) => (b.completed || '').localeCompare(a.completed || ''));
  } else {
    tasks = visibleTasks.filter((t) => t.status !== 'COMPLETED');
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
  const today = localDateStr(new Date());
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
  if (overdue.length)
    groups.push({ key: 'overdue', label: 'Overdue', overdue: true, items: overdue });
  if (todayItems.length)
    groups.push({ key: 'today', label: `Today · ${formatDateHeader(today)}`, items: todayItems });
  if (tomorrowItems.length)
    groups.push({
      key: 'tomorrow',
      label: `Tomorrow · ${formatDateHeader(tomorrow)}`,
      items: tomorrowItems,
    });
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
    if (!dateStr) {
      noDate.push(task);
      continue;
    }
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
    section.className = 'mt-md';

    const heading = document.createElement('h3');
    heading.className =
      'px-md pb-xs text-sm font-semibold tracking-wider uppercase ' +
      (group.overdue ? 'text-danger' : 'text-text-muted');
    heading.textContent = group.label;
    section.appendChild(heading);

    const ul = document.createElement('ul');
    ul.className = 'list-none';
    for (const task of group.items) {
      ul.appendChild(
        buildTaskItem(task, {
          onComplete: callbacks.onComplete ? (t) => callbacks.onComplete(t) : null,
          onStar: callbacks.onStar ? (t) => callbacks.onStar(t) : null,
          onClick: callbacks.onEdit ? (t) => callbacks.onEdit(t) : null,
          onSnooze: callbacks.onSnooze ? (t) => callbacks.onSnooze(t) : null,
          showDue,
        }),
      );
    }
    section.appendChild(ul);
    container.appendChild(section);
  }

  if (isEmpty) {
    const empty = document.createElement('p');
    empty.className = 'px-md py-xl text-center text-md text-text-muted';
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
  if (order === 'created')
    return copy.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  // Shared with Tasks.org; set by dragging cards on a board.
  if (order === 'manual') return copy.sort(compareManual);
  if (order === 'starred') {
    return copy.sort((a, b) => {
      if (a.important && !b.important) return -1;
      if (!a.important && b.important) return 1;
      return compareDue(a, b);
    });
  }
  if (order === 'priority') {
    return copy.sort(
      (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || compareDue(a, b),
    );
  }
  return copy.sort(compareDue);
}

/** Earliest due first; tasks without a due date last. */
function compareDue(a, b) {
  if (a.due && b.due) return a.due.localeCompare(b.due);
  if (a.due) return -1;
  if (b.due) return 1;
  return 0;
}

// ── Utilities ──────────────────────────────────────────────

function formatDateHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday} ${formatShortDate(d, state.config.dateFormat || 'dmy')}`;
}
