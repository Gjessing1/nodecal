import { state } from '../app/state.js';
import { getAllCategories, parseTagsFromTitle } from '../app/taskUtils.js';
import { localDateStr } from '../app/utils.js';
import { effectiveTaskSource } from '../app/profiles.js';
import { openTaskModal } from './taskModal.js';

let _quickAddEl = null;

export function destroyTaskQuickAdd() {
  if (_quickAddEl) { _quickAddEl.remove(); _quickAddEl = null; }
  document.getElementById('app')?.classList.remove('tasks-quickadd-visible');
}

export function focusTaskQuickAdd() {
  document.getElementById('task-quick-add-input')?.focus();
}

export function mountTaskQuickAdd(callbacks) {
  destroyTaskQuickAdd();
  _quickAddEl = buildQuickAdd(callbacks);
  const app = document.getElementById('app');
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) app.insertBefore(_quickAddEl, bottomNav);
  app.classList.add('tasks-quickadd-visible');
}

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

  // NLP feedback shown below the input (similar to calendar quick-add)
  const nlpFb = document.createElement('div');
  nlpFb.className = 'nlp-feedback hidden';

  let nlpTimer = null;
  function updateNlpFeedback() {
    const raw = input.value.trim();
    if (!raw || raw.startsWith('#') || selectedDue) { nlpFb.classList.add('hidden'); return; }
    clearTimeout(nlpTimer);
    nlpTimer = setTimeout(async () => {
      try {
        const res = await fetch('/nlp/parse-task', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: raw }),
        });
        const data = await res.json();
        if (!data.parsed) { nlpFb.classList.add('hidden'); return; }
        const parts = [];
        if (data.due) {
          const d = new Date(data.due + 'T00:00:00');
          const today = localDateStr(new Date());
          const tomorrow = localDateStr(new Date(Date.now() + 86400000));
          if (data.due === today) parts.push('Today');
          else if (data.due === tomorrow) parts.push('Tomorrow');
          else parts.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
        }
        if (data.rrule) parts.push('Repeats');
        else if (data.xRecurringType) parts.push('Repeats after done');
        if (parts.length) {
          nlpFb.textContent = parts.join(' · ');
          nlpFb.classList.remove('hidden');
        } else {
          nlpFb.classList.add('hidden');
        }
      } catch { nlpFb.classList.add('hidden'); }
    }, 300);
  }

  input.addEventListener('input', () => { showAutocomplete(); updateNlpFeedback(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { autocompleteList.style.display = 'none'; }
    if (e.key === 'Enter') { autocompleteList.style.display = 'none'; nlpFb.classList.add('hidden'); submit(); }
  });
  input.addEventListener('blur', () => { setTimeout(() => { autocompleteList.style.display = 'none'; }, 150); });

  inputWrap.appendChild(input);
  inputWrap.appendChild(autocompleteList);
  inputWrap.appendChild(nlpFb);

  const dates = document.createElement('div');
  dates.className = 'tasks-quickadd-dates';

  let selectedDue = null;
  const today    = localDateStr(new Date());
  const tomorrow = localDateStr(new Date(Date.now() + 86400000));

  function makeShortcut(label, value) {
    const btn = document.createElement('button');
    btn.className = 'tasks-date-shortcut';
    btn.textContent = label;
    // Prevent focus theft: keep mobile keyboard visible when tapping date shortcuts
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      selectedDue = selectedDue === value ? null : value;
      updateActive();
      input.focus();
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
    if (datePicker.value) { selectedDue = datePicker.value; updateActive(); }
  });
  pickBtn.addEventListener('mousedown', e => e.preventDefault());
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

  // Source selector (only shown when multiple sources configured). Pre-select
  // the active profile's task source so switching profiles changes where new
  // tasks land.
  let selectedSource = effectiveTaskSource() || null;
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
    nlpFb.classList.add('hidden');
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

  bar.appendChild(dates);
  bar.appendChild(sourceRow);
  bar.appendChild(row);
  return bar;
}
