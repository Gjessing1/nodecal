import { state } from '../app/state.js';
import { getAllCategories, visibleCategories } from '../app/taskUtils.js';
import { esc } from '../app/utils.js';
import { buildRecurrenceEditor } from './recurrenceUI.js';
import { buildDatePickerButton, mountLocationUrlSection, mountCollapsibleToggle, wireCategoryUI } from './modalHelpers.js';

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
      <input type="hidden" id="tm-due" value="${task.due || ''}">
      <div id="tm-due-wrap"></div>
    </div>

    <div id="tm-location-url-wrap" class="collapsible-field-wrap"></div>

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

    <div id="tm-rr-toggle" class="collapsible-field-wrap"></div>
    <div id="tm-rr-body">
      <div class="modal-row modal-row-start">
        <div class="modal-field">
          <label>Repeat</label>
          <div class="rec-mode-toggle">
            <button type="button" class="rec-mode-btn${!isRecAfterCompletion ? ' active' : ''}" data-mode="fixed">Fixed</button>
            <button type="button" class="rec-mode-btn${isRecAfterCompletion ? ' active' : ''}" data-mode="after">After done</button>
          </div>
          <div id="tm-rec-preset-target" style="${isRecAfterCompletion ? 'display:none' : ''}"></div>
          <div id="tm-rec-after" style="${isRecAfterCompletion ? '' : 'display:none'}">
            <div class="rec-after-row">
              Every
              <input type="number" id="tm-after-n" class="rec-interval-input" min="1" max="999"
                     value="${esc(task.recurringInterval?.replace(/[dw]$/,'') || '1')}">
              <select id="tm-after-unit" class="rec-freq-sel">
                <option value="d"${/d$/.test(task.recurringInterval||'') ? ' selected':''}>day(s)</option>
                <option value="w"${/w$/.test(task.recurringInterval||'') ? ' selected':''}>week(s)</option>
              </select>
              after completion
            </div>
          </div>
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
    </div>

    <div class="modal-field" id="tm-reminder-custom-row" style="${task.taskReminder?.startsWith('custom') ? '' : 'display:none'}">
      <label>Hours before morning time on due date</label>
      <input type="number" id="tm-reminder-custom-hours" value="${task.taskReminder?.startsWith('custom') ? task.taskReminder.replace('custom-','').replace('h','') : ''}" min="1" max="720" placeholder="e.g. 4">
    </div>

    <div id="tm-rec-fixed" style="${isRecAfterCompletion ? 'display:none' : ''}"
         data-rrule="${esc(isRecRrule ? (task.rrule || '') : '')}"></div>

    <div class="modal-field modal-field-checkbox tm-completed-row">
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

  // ── Due date picker button ─────────────────────────────────────────────────
  buildDatePickerButton(sheet.querySelector('#tm-due'), sheet.querySelector('#tm-due-wrap'), { emptyLabel: 'No due date' });

  // ── Location / URL (collapsible) ─────────────────────────────────────────
  mountLocationUrlSection(sheet.querySelector('#tm-location-url-wrap'), {
    locId: 'tm-location', urlId: 'tm-url',
    initLoc: task.location || '', initUrl: task.url || '',
  });

  // ── Reminder / Repeat collapse when unused ────────────────────────────────
  mountCollapsibleToggle(
    sheet.querySelector('#tm-rr-toggle'),
    sheet.querySelector('#tm-rr-body'),
    { label: '+ Reminder / Repeat', hasContent: !!(task.taskReminder && task.taskReminder !== 'none') || !!(isRecRrule || isRecAfterCompletion) }
  );

  // Track categories in modal as mutable array
  const modalCats = [...taskCats];

  const catCtrl = wireCategoryUI(
    sheet.querySelector('#tm-cats-chips'),
    sheet.querySelector('#tm-cat-input'),
    sheet.querySelector('#tm-cat-add'),
    sheet.querySelector('.tm-cat-autocomplete'),
    modalCats,
    existingCats
  );

  // ── Recurrence mode toggle + editor ──────────────────────────────────────
  const fixedContainer = sheet.querySelector('#tm-rec-fixed');
  const afterContainer = sheet.querySelector('#tm-rec-after');
  const presetTarget   = sheet.querySelector('#tm-rec-preset-target');
  let recMode = isRecAfterCompletion ? 'after' : 'fixed';

  if (fixedContainer && presetTarget) {
    const dueEl = sheet.querySelector('#tm-due');
    const dueDate = dueEl?.value ? new Date(dueEl.value + 'T00:00:00') : new Date();
    // presetContainer receives the preset select; returned root is the sub-UI
    const recSubRoot = buildRecurrenceEditor(
      dueDate,
      isRecRrule ? (task.rrule || null) : null,
      (newRrule) => { fixedContainer.dataset.rrule = newRrule || ''; },
      { hideWeekdays: true, presetContainer: presetTarget }
    );
    fixedContainer.appendChild(recSubRoot);
  }

  sheet.querySelectorAll('.rec-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      recMode = btn.dataset.mode;
      sheet.querySelectorAll('.rec-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === recMode));
      if (presetTarget) presetTarget.style.display = recMode === 'fixed' ? '' : 'none';
      if (fixedContainer) fixedContainer.style.display = recMode === 'fixed' ? '' : 'none';
      if (afterContainer) afterContainer.style.display = recMode === 'after' ? '' : 'none';
    });
  });

  sheet.querySelector('#tm-reminder').addEventListener('change', e => {
    sheet.querySelector('#tm-reminder-custom-row').style.display = e.target.value === 'custom' ? '' : 'none';
  });

  sheet.querySelector('#tm-save').addEventListener('click', () => {
    const title = sheet.querySelector('#tm-title').value.trim();
    if (!title) { alert('Title is required'); return; }

    let rrule = null, xRecurringType = null, xRecurringInterval = null;
    if (recMode === 'after') {
      const n    = parseInt(sheet.querySelector('#tm-after-n')?.value) || 1;
      const unit = sheet.querySelector('#tm-after-unit')?.value || 'd';
      xRecurringType = 'after-completion';
      xRecurringInterval = `${n}${unit}`;
    } else {
      const fixedCont = sheet.querySelector('#tm-rec-fixed');
      rrule = fixedCont ? (fixedCont.dataset.rrule || null) : null;
    }

    const completedChecked = sheet.querySelector('#tm-completed').checked;
    const finalCats = catCtrl.getCategories();

    onSave({
      title,
      due:         sheet.querySelector('#tm-due').value || null,
      location:    sheet.querySelector('#tm-location-url-wrap #tm-location')?.value.trim() || '',
      url:         sheet.querySelector('#tm-location-url-wrap #tm-url')?.value.trim() || '',
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
