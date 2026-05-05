import { state } from '../app/state.js';
import { toDateInputValue, toTimeInputValue } from '../app/utils.js';

let overlay, sheet, onSaveCb, onDeleteCb;

export function initModal() {
  overlay = document.getElementById('modal-overlay');
  sheet = overlay.querySelector('.modal-sheet');
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
}

/**
 * Open the modal for creating a new event.
 * @param {Date} defaultDate
 * @param {function(data): void} onSave
 */
export function openNewEventModal(defaultDate, onSave) {
  onSaveCb = onSave;
  onDeleteCb = null;
  renderForm(null, defaultDate);
  overlay.classList.remove('hidden');
}

/**
 * Open the modal for editing an existing event.
 * @param {object} event
 * @param {function(data): void} onSave
 * @param {function(id): void} onDelete
 */
export function openEditEventModal(event, onSave, onDelete) {
  onSaveCb = onSave;
  onDeleteCb = onDelete;
  renderForm(event, null);
  overlay.classList.remove('hidden');
}

export function closeModal() {
  overlay.classList.add('hidden');
}

function renderForm(event, defaultDate) {
  const isNew = !event;
  const start = event ? new Date(event.start) : (defaultDate || new Date());
  const end = event ? new Date(event.end) : new Date(start.getTime() + 3600000);

  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">${isNew ? 'New Event' : 'Edit Event'}</div>
    <div class="modal-field">
      <label>Title</label>
      <input type="text" id="f-title" value="${esc(event?.title || '')}" placeholder="Event title" autocomplete="off">
    </div>
    <div class="modal-field">
      <label><input type="checkbox" id="f-allday" ${event?.allDay ? 'checked' : ''}> All day</label>
    </div>
    <div class="modal-row">
      <div class="modal-field">
        <label>Date</label>
        <input type="date" id="f-date" value="${toDateInputValue(start)}">
      </div>
    </div>
    <div class="modal-row" id="time-row" ${event?.allDay ? 'style="display:none"' : ''}>
      <div class="modal-field">
        <label>Start</label>
        <input type="time" id="f-start-time" value="${toTimeInputValue(start)}">
      </div>
      <div class="modal-field">
        <label>End</label>
        <input type="time" id="f-end-time" value="${toTimeInputValue(end)}">
      </div>
    </div>
    <div class="modal-field">
      <label>Calendar</label>
      <select id="f-calendar">
        ${state.calendars.map(c => `<option value="${esc(c.id)}" ${event?.calendarId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>
    ${event?.recurring ? `
    <div class="modal-field recurring-scope-field">
      <label>Edit scope</label>
      <select id="f-scope">
        <option value="single">This event only</option>
        <option value="future">This and following</option>
        <option value="all">All events in series</option>
      </select>
    </div>` : ''}
    <div class="modal-field">
      <label>Description</label>
      <textarea id="f-desc">${esc(event?.description || '')}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="f-save">Save</button>
      ${!isNew ? '<button class="btn btn-danger" id="f-delete">Delete</button>' : ''}
      <button class="btn btn-ghost" id="f-cancel">Cancel</button>
    </div>
  `;

  sheet.querySelector('#f-allday').addEventListener('change', e => {
    sheet.querySelector('#time-row').style.display = e.target.checked ? 'none' : '';
  });
  sheet.querySelector('#f-save').addEventListener('click', () => handleSave(event));
  sheet.querySelector('#f-cancel').addEventListener('click', closeModal);
  if (!isNew) {
    sheet.querySelector('#f-delete').addEventListener('click', () => {
      const scope = sheet.querySelector('#f-scope')?.value || null;
      closeModal();
      onDeleteCb(event, scope);
    });
  }
  if (isNew) sheet.querySelector('#f-title').focus();
}

function handleSave(event) {
  const title = sheet.querySelector('#f-title').value.trim();
  if (!title) { sheet.querySelector('#f-title').focus(); return; }

  const allDay = sheet.querySelector('#f-allday').checked;
  const dateVal = sheet.querySelector('#f-date').value;
  const startTime = allDay ? '00:00' : sheet.querySelector('#f-start-time').value;
  const endTime = allDay ? '00:00' : sheet.querySelector('#f-end-time').value;
  const calendarId = sheet.querySelector('#f-calendar').value;
  const description = sheet.querySelector('#f-desc').value.trim();

  const startDt = new Date(`${dateVal}T${startTime}`);
  let endDt = new Date(`${dateVal}T${endTime}`);
  if (allDay) {
    endDt = new Date(startDt.getTime() + 86400000);
  } else if (endDt <= startDt) {
    endDt = new Date(startDt.getTime() + 3600000);
  }

  const data = { title, start: startDt.toISOString(), end: endDt.toISOString(), allDay, calendarId, description };
  if (event?.recurring) {
    data.recurringScope = sheet.querySelector('#f-scope')?.value || 'single';
    data.uid = event.uid;
    data.occurrenceDate = event.occurrenceDate;
  }

  closeModal();
  onSaveCb(data);
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
