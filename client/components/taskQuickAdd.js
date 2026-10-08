import { state } from '../app/state.js';
import { getAllCategories, parseTagsFromTitle } from '../app/taskUtils.js';
import { localDateStr } from '../app/utils.js';
import { effectiveTaskSource, rememberTaskSource } from '../app/profileTargets.js';
import { openTaskModal } from './taskModal.js';
import { buildTaskQuickAddDetails } from './taskQuickAddDetails.js';

const QUICK_SELECT_CLASSES =
  'shrink-0 rounded-lg border border-border bg-bg px-sm py-xs text-sm text-text-muted';

let _quickAddEl = null;
let _syncBoardFilters = null;
const statusByBoard = new Map();

export function destroyTaskQuickAdd() {
  if (_quickAddEl) {
    _quickAddEl.remove();
    _quickAddEl = null;
  }
  _syncBoardFilters = null;
  document.getElementById('app')?.classList.remove('tasks-quickadd-visible');
}

export function syncTaskQuickAddBoardFilters() {
  if (_syncBoardFilters) _syncBoardFilters();
}

export function focusTaskQuickAdd() {
  document.getElementById('task-quick-add-input')?.focus();
}

/**
 * @param {Record<string, Function|null>} callbacks
 * @param {{statusBoardId?: string, getFilters?: () => {source: string, category: string}}} [boardOptions]
 */
export function mountTaskQuickAdd(callbacks, boardOptions = {}) {
  destroyTaskQuickAdd();
  _quickAddEl = buildQuickAdd(callbacks, boardOptions);
  const app = document.getElementById('app');
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) app.insertBefore(_quickAddEl, bottomNav);
  app.classList.add('tasks-quickadd-visible');
}

/**
 * @param {Record<string, Function|null>} callbacks
 * @param {{statusBoardId?: string, getFilters?: () => {source: string, category: string}}} boardOptions
 */
function buildQuickAdd(callbacks, boardOptions) {
  const bar = document.createElement('div');
  bar.className =
    'task-quickadd fixed right-0 bottom-[calc(var(--nav-height)+var(--app-safe-area-bottom))] left-0 z-50 border-t border-border bg-bg pt-xs pr-[calc(var(--spacing-md)+var(--app-safe-area-right))] pb-sm pl-[calc(var(--spacing-md)+var(--app-safe-area-left))]';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'relative flex-1';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'task-quick-add-input';
  input.className = 'w-full rounded-md px-md py-sm text-md';
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
    if (!hw) {
      autocompleteList.style.display = 'none';
      return;
    }
    const hidden = state.config.hiddenCategories || [];
    const cats = getAllCategories(state.tasks).filter(
      (c) => !hidden.includes(c) && c.startsWith(hw.partial.toLowerCase()),
    );
    if (!cats.length) {
      autocompleteList.style.display = 'none';
      return;
    }

    autocompleteList.innerHTML = '';
    for (const cat of cats.slice(0, 8)) {
      const li = document.createElement('li');
      li.textContent = cat;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const hw2 = getCurrentHashWord();
        if (!hw2) return;
        const val = input.value;
        input.value =
          val.slice(0, hw2.start) + '#' + cat + ' ' + val.slice(hw2.start + hw2.word.length);
        input.focus();
        autocompleteList.style.display = 'none';
      });
      autocompleteList.appendChild(li);
    }
    autocompleteList.style.display = '';
  }

  // NLP feedback shown below the input (similar to calendar quick-add)
  const nlpFb = document.createElement('div');
  nlpFb.className = 'nlp-feedback hidden';

  let nlpTimer = null;
  function updateNlpFeedback() {
    const raw = input.value.trim();
    if (!raw || raw.startsWith('#') || selectedDue) {
      nlpFb.classList.add('hidden');
      return;
    }
    clearTimeout(nlpTimer);
    nlpTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/nlp/parse-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: raw }),
        });
        const data = await res.json();
        if (!data.parsed) {
          nlpFb.classList.add('hidden');
          return;
        }
        const parts = [];
        if (data.due) {
          const d = new Date(data.due + 'T00:00:00');
          const today = localDateStr(new Date());
          const tomorrow = localDateStr(new Date(Date.now() + 86400000));
          if (data.due === today) parts.push('Today');
          else if (data.due === tomorrow) parts.push('Tomorrow');
          else
            parts.push(
              d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            );
        }
        if (data.rrule) parts.push('Repeats');
        else if (data.xRecurringType) parts.push('Repeats after done');
        if (parts.length) {
          nlpFb.textContent = parts.join(' · ');
          nlpFb.classList.remove('hidden');
        } else {
          nlpFb.classList.add('hidden');
        }
      } catch {
        nlpFb.classList.add('hidden');
      }
    }, 300);
  }

  input.addEventListener('input', () => {
    showAutocomplete();
    updateNlpFeedback();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      autocompleteList.style.display = 'none';
    }
    if (e.key === 'Enter') {
      autocompleteList.style.display = 'none';
      nlpFb.classList.add('hidden');
      submit();
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      autocompleteList.style.display = 'none';
    }, 150);
  });

  inputWrap.appendChild(input);
  inputWrap.appendChild(autocompleteList);
  inputWrap.appendChild(nlpFb);

  const choices = document.createElement('div');
  choices.className = 'task-quickadd-extra mt-xs flex items-center gap-xs';

  let selectedDue = null;
  const today = localDateStr(new Date());
  const tomorrow = localDateStr(new Date(Date.now() + 86400000));
  const dueSelect = document.createElement('select');
  dueSelect.className = QUICK_SELECT_CLASSES;
  dueSelect.setAttribute('aria-label', 'New task due date');
  dueSelect.append(
    new Option('Due', ''),
    new Option('Today', today),
    new Option('Tomorrow', tomorrow),
    new Option('Pick date…', 'pick'),
  );

  const datePicker = document.createElement('input');
  datePicker.type = 'date';
  datePicker.className = 'pointer-events-none absolute size-px opacity-0';
  datePicker.addEventListener('change', () => {
    if (datePicker.value) {
      selectedDue = datePicker.value;
      updateDueSelect();
      nlpFb.classList.add('hidden');
      input.focus();
    }
  });
  dueSelect.addEventListener('change', function chooseDue() {
    if (dueSelect.value === 'pick') {
      updateDueSelect();
      try {
        if (datePicker.showPicker) datePicker.showPicker();
        else datePicker.click();
      } catch {
        datePicker.click();
      }
      return;
    }
    selectedDue = dueSelect.value || null;
    updateDueSelect();
    nlpFb.classList.add('hidden');
    input.focus();
  });

  function updateDueSelect() {
    const custom = dueSelect.querySelector('option[data-custom]');
    if (custom) custom.remove();
    if (selectedDue && selectedDue !== today && selectedDue !== tomorrow) {
      const date = new Date(selectedDue + 'T00:00:00');
      const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const option = new Option(label, selectedDue);
      option.dataset.custom = '';
      dueSelect.add(option, dueSelect.querySelector('option[value="pick"]'));
    }
    dueSelect.value = selectedDue || '';
  }

  choices.append(dueSelect, datePicker);

  // One compact choice keeps quick-add usable on the status board without
  // adding a separate action button for every status.
  let selectedStatus = 'NEEDS-ACTION';
  if (boardOptions.statusBoardId) {
    selectedStatus = statusByBoard.get(boardOptions.statusBoardId) || selectedStatus;
    const statusSelect = document.createElement('select');
    statusSelect.className = QUICK_SELECT_CLASSES;
    statusSelect.setAttribute('aria-label', 'New task status');
    statusSelect.append(new Option('To do', 'NEEDS-ACTION'), new Option('Doing', 'IN-PROCESS'));
    statusSelect.value = selectedStatus;
    statusSelect.addEventListener('change', function chooseStatus() {
      selectedStatus = statusSelect.value;
      statusByBoard.set(boardOptions.statusBoardId, selectedStatus);
      input.focus();
    });
    choices.prepend(statusSelect);
  }

  // Boards can narrow the source; keep that as the add target until the user
  // deliberately chooses another source in the expanded fields.
  let filterSource = boardOptions.getFilters?.().source || '';
  let selectedSource = filterSource || effectiveTaskSource() || null;
  let sourceExplicit = false;

  function currentFields(tags) {
    const categories = [...tags];
    const boardCategory = boardOptions.getFilters?.().category;
    if (boardCategory && !categories.includes(boardCategory)) categories.push(boardCategory);
    return {
      categories: categories.length ? categories : undefined,
      source: selectedSource || undefined,
      status: selectedStatus,
      ...details.read(),
    };
  }

  const details = buildTaskQuickAddDetails(
    function openFullEditor() {
      const { title, tags } = parseTagsFromTitle(input.value.trim());
      openTaskModal(
        { title, due: selectedDue, ...currentFields(tags) },
        { onSave: (data) => callbacks.onAdd(data), onDelete: () => {} },
      );
    },
    {
      sources: state.taskSources || [],
      source: selectedSource,
      onSourceChange(url) {
        sourceExplicit = true;
        selectedSource = url;
        rememberTaskSource(url);
      },
    },
  );
  _syncBoardFilters = function syncBoardFilters() {
    const nextSource = boardOptions.getFilters?.().source || '';
    if (nextSource === filterSource) return;
    filterSource = nextSource;
    if (sourceExplicit) return;
    selectedSource = nextSource || effectiveTaskSource() || null;
    details.setSource(selectedSource);
  };

  async function submit() {
    const raw = input.value.trim();
    if (!raw) return;
    const { title: rawTitle, tags } = parseTagsFromTitle(raw);
    if (!rawTitle) {
      input.value = '';
      return;
    }
    input.value = '';
    nlpFb.classList.add('hidden');
    const taskFields = currentFields(tags);

    // If user has selected a specific due date, use it and skip NLP date parsing
    if (selectedDue) {
      const due = selectedDue;
      selectedDue = null;
      updateDueSelect();
      await callbacks.onAdd({
        title: rawTitle,
        due,
        ...taskFields,
      });
      return;
    }
    selectedDue = null;
    updateDueSelect();

    // Run NLP to extract date and recurrence from the title
    try {
      const res = await fetch('/api/nlp/parse-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawTitle }),
      });
      const nlp = await res.json();
      if (nlp.parsed) {
        await callbacks.onAdd({
          title: nlp.title || rawTitle,
          due: nlp.due || null,
          ...taskFields,
          rrule: nlp.rrule || undefined,
          xRecurringType: nlp.xRecurringType || undefined,
          xRecurringInterval: nlp.xRecurringInterval || undefined,
        });
      } else {
        await callbacks.onAdd({
          title: rawTitle,
          due: null,
          ...taskFields,
        });
      }
    } catch {
      await callbacks.onAdd({
        title: rawTitle,
        due: null,
        ...taskFields,
      });
    }
  }

  const submitBtn = document.createElement('button');
  submitBtn.className =
    'flex size-touch shrink-0 items-center justify-center rounded-full bg-accent text-icon text-on-accent';
  submitBtn.textContent = '↵';
  submitBtn.setAttribute('aria-label', 'Quick add task');
  submitBtn.addEventListener('click', submit);

  const row = document.createElement('div');
  row.className = 'mt-xs flex gap-sm';
  row.appendChild(inputWrap);
  row.appendChild(submitBtn);

  choices.appendChild(details.trigger);
  bar.appendChild(choices);
  bar.appendChild(details.panel);
  bar.appendChild(row);
  return bar;
}
