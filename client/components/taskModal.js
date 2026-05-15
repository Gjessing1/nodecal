import { state } from '../app/state.js';
import { getAllCategories, visibleCategories } from '../app/taskUtils.js';
import { esc } from '../app/utils.js';

function buildWeeklyRrule(due) {
  const days = ['SU','MO','TU','WE','TH','FR','SA'];
  if (due) return `FREQ=WEEKLY;BYDAY=${days[new Date(due + 'T00:00:00').getDay()]}`;
  return 'FREQ=WEEKLY';
}

function buildMonthlyRrule(due) {
  if (due) return `FREQ=MONTHLY;BYMONTHDAY=${new Date(due + 'T00:00:00').getDate()}`;
  return 'FREQ=MONTHLY';
}

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
      <textarea id="tm-desc" rows="4">${esc(task.description || '')}</textarea>
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

    <div class="modal-row">
      <div class="modal-field">
        <label>Repeat</label>
        <select id="tm-recurring">
          <option value="">None</option>
          <option value="rrule-daily"   ${isRecRrule && task.rrule?.includes('DAILY')   ? 'selected' : ''}>Daily</option>
          <option value="rrule-weekly"  ${isRecRrule && task.rrule?.includes('WEEKLY')  ? 'selected' : ''}>Weekly</option>
          <option value="rrule-monthly" ${isRecRrule && task.rrule?.includes('MONTHLY') ? 'selected' : ''}>Monthly</option>
          <option value="after-custom"  ${isRecAfterCompletion ? 'selected' : ''}>After done</option>
        </select>
      </div>
      <div class="modal-field">
        <label>Reminder</label>
        <select id="tm-reminder">
          <option value="none"           ${!task.taskReminder || task.taskReminder === 'none' ? 'selected' : ''}>None</option>
          <option value="on-due"         ${task.taskReminder === 'on-due'          ? 'selected' : ''}>Morning on due</option>
          <option value="evening-due"    ${task.taskReminder === 'evening-due'     ? 'selected' : ''}>Evening on due</option>
          <option value="morning-before" ${task.taskReminder === 'morning-before'  ? 'selected' : ''}>Morning before</option>
          <option value="evening-before" ${task.taskReminder === 'evening-before'  ? 'selected' : ''}>Evening before</option>
          <option value="custom"         ${task.taskReminder?.startsWith('custom') ? 'selected' : ''}>Custom…</option>
        </select>
      </div>
    </div>

    <div class="modal-field" id="tm-interval-field" style="${isRecAfterCompletion ? '' : 'display:none'}">
      <label>Interval (e.g. 3d, 2w)</label>
      <input type="text" id="tm-interval" value="${esc(task.recurringInterval || '')}" placeholder="e.g. 3d, 2w">
    </div>

    <div class="modal-field" id="tm-reminder-custom-row" style="${task.taskReminder?.startsWith('custom') ? '' : 'display:none'}">
      <label>Hours before morning time on due date</label>
      <input type="number" id="tm-reminder-custom-hours" value="${task.taskReminder?.startsWith('custom') ? task.taskReminder.replace('custom-','').replace('h','') : ''}" min="1" max="720" placeholder="e.g. 4">
    </div>

    <div class="modal-field modal-field-checkbox">
      <label>
        <input type="checkbox" id="tm-completed" ${isCompleted ? 'checked' : ''}>
        Completed
      </label>
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
  sheet.querySelector('#tm-reminder').addEventListener('change', e => {
    sheet.querySelector('#tm-reminder-custom-row').style.display = e.target.value === 'custom' ? '' : 'none';
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

    // Auto-add any category text that was typed but not yet submitted with the + button
    const pendingCat = catInput.value.trim().toLowerCase();
    if (pendingCat && !modalCats.includes(pendingCat)) modalCats.push(pendingCat);

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
      taskReminder: (() => {
        const v = sheet.querySelector('#tm-reminder')?.value || 'none';
        if (v === 'custom') {
          const h = parseInt(sheet.querySelector('#tm-reminder-custom-hours')?.value || '0');
          return h > 0 ? `custom-${h}h` : 'none';
        }
        return v;
      })(),
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
