import { state } from '../app/state.js';
import { toDateInputValue, toTimeInputValue, localToUTC } from '../app/utils.js';

const WHEEL_ITEM_H = 40;

function buildTimeWheel(id, date, timezone = 'UTC') {
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.id = id;

  // Read h/m in the configured timezone, not browser local time
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
  }).formatToParts(date);
  let hVal = parseInt(parts.find(p => p.type === 'hour').value) % 24;
  let mVal = Math.round(parseInt(parts.find(p => p.type === 'minute').value) / 5) * 5 % 60;
  hidden.value = `${String(hVal).padStart(2, '0')}:${String(mVal).padStart(2, '0')}`;

  function sync() {
    hidden.value = `${String(hVal).padStart(2, '0')}:${String(mVal).padStart(2, '0')}`;
  }

  function makeWheel(items, initial, onChange) {
    const outer = document.createElement('div');
    outer.className = 'time-wheel';

    const indicator = document.createElement('div');
    indicator.className = 'time-wheel-selection';
    outer.appendChild(indicator);

    const scroller = document.createElement('div');
    scroller.className = 'time-wheel-scroller';

    const padTop = document.createElement('div');
    padTop.className = 'time-wheel-pad-item';
    scroller.appendChild(padTop);

    for (const v of items) {
      const item = document.createElement('div');
      item.className = 'time-wheel-item';
      item.textContent = String(v).padStart(2, '0');
      scroller.appendChild(item);
    }

    const padBot = document.createElement('div');
    padBot.className = 'time-wheel-pad-item';
    scroller.appendChild(padBot);

    outer.appendChild(scroller);

    requestAnimationFrame(() => {
      scroller.scrollTop = items.indexOf(initial) * WHEEL_ITEM_H;
    });

    let t;
    scroller.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const idx = Math.round(scroller.scrollTop / WHEEL_ITEM_H);
        onChange(items[Math.max(0, Math.min(idx, items.length - 1))]);
      }, 80);
    }, { passive: true });

    return outer;
  }

  const pair = document.createElement('div');
  pair.className = 'time-wheel-pair';
  pair.appendChild(hidden);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const mins = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const hWheel = makeWheel(hours, hVal, v => { hVal = v; sync(); });
  const sep = document.createElement('span');
  sep.className = 'time-wheel-sep';
  sep.textContent = ':';
  const mWheel = makeWheel(mins, mVal, v => { mVal = v; sync(); });

  pair.appendChild(hWheel);
  pair.appendChild(sep);
  pair.appendChild(mWheel);
  return pair;
}

let overlay, sheet, onSaveCb, onDeleteCb, onDuplicateCb;

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
  onDuplicateCb = null;
  renderForm(null, defaultDate);
  overlay.classList.remove('hidden');
}

/**
 * Open the modal for editing an existing event.
 * @param {object} event
 * @param {function(data): void} onSave
 * @param {function(event, scope): void} onDelete
 * @param {function(event): void} [onDuplicate]
 */
export function openEditEventModal(event, onSave, onDelete, onDuplicate) {
  onSaveCb = onSave;
  onDeleteCb = onDelete;
  onDuplicateCb = onDuplicate || null;
  renderForm(event, null);
  overlay.classList.remove('hidden');
}

export function closeModal() {
  overlay.classList.add('hidden');
}

function computeDefaultStart(date, tz) {
  const todayStr = toDateInputValue(new Date(), tz);
  const dateStr  = toDateInputValue(date, tz);
  if (dateStr === todayStr) {
    const rounded = Math.ceil(Date.now() / (15 * 60000)) * (15 * 60000);
    return new Date(rounded);
  }
  const t = state.config.defaultEventTime || '09:00';
  return localToUTC(dateStr, t, tz);
}

function renderForm(event, defaultDate) {
  const isNew = !event;
  const tz = state.config.timezone;
  const durMs = (state.config.defaultEventDuration || 60) * 60000;
  const start = event ? new Date(event.start) : computeDefaultStart(defaultDate || new Date(), tz);
  const end = event ? new Date(event.end) : new Date(start.getTime() + durMs);
  // For all-day events, slice the UTC date string directly — never convert through local timezone.
  const allDayDateVal = event?.allDay ? event.start.slice(0, 10) : toDateInputValue(start, tz);
  const is24h = state.config.timeFormat === '24h';

  // Default calendar: prefer event's calendar, then settings default, then first available
  const defaultCalId = event?.calendarId || state.config.defaultCalendar || state.calendars[0]?.id;

  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">${isNew ? 'New Event' : 'Edit Event'}</div>
    ${isNew ? `
    <div class="modal-field nlp-field">
      <label>Quick add</label>
      <input type="text" id="f-nlp" placeholder="e.g. Team meeting tomorrow 14:00" autocomplete="off" spellcheck="false">
      <div class="nlp-feedback hidden" id="nlp-fb"></div>
    </div>` : ''}
    <div class="modal-field">
      <label>Title</label>
      <input type="text" id="f-title" value="${esc(event?.title || '')}" placeholder="Event title" autocomplete="off">
    </div>
    <div class="modal-field modal-toggle-field">
      <label for="f-allday">All day</label>
      <input type="checkbox" id="f-allday" ${event?.allDay ? 'checked' : ''}>
    </div>
    <div class="modal-field" id="allday-date-row"${!event?.allDay ? ' style="display:none"' : ''}>
      <label>Date</label>
      <input type="date" id="f-date" value="${allDayDateVal}">
    </div>
    <div class="modal-datetime-row" id="time-row"${event?.allDay ? ' style="display:none"' : ''}>
      <div class="datetime-col">
        <label class="datetime-label">From</label>
        <input type="date" id="f-start-date" value="${toDateInputValue(start, tz)}">
        <div id="f-start-time-wrap"></div>
      </div>
      <span class="datetime-arrow">→</span>
      <div class="datetime-col">
        <label class="datetime-label">To</label>
        <input type="date" id="f-end-date" value="${toDateInputValue(end, tz)}">
        <div id="f-end-time-wrap"></div>
      </div>
    </div>
    <div class="modal-field">
      <label>Calendar</label>
      <select id="f-calendar">
        ${state.calendars.map(c => `<option value="${esc(c.id)}" ${defaultCalId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
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
      ${!isNew ? '<button class="btn btn-ghost" id="f-duplicate">Duplicate</button>' : ''}
      ${!isNew ? '<button class="btn btn-danger" id="f-delete">Delete</button>' : ''}
      <button class="btn btn-ghost" id="f-cancel">Cancel</button>
    </div>
  `;

  // Insert time widgets after innerHTML so DOM elements can be appended
  const startWrap = sheet.querySelector('#f-start-time-wrap');
  const endWrap = sheet.querySelector('#f-end-time-wrap');
  if (is24h) {
    startWrap.appendChild(buildTimeWheel('f-start-time', start, tz));
    endWrap.appendChild(buildTimeWheel('f-end-time', end, tz));
  } else {
    startWrap.innerHTML = `<input type="time" id="f-start-time" value="${toTimeInputValue(start, tz)}" style="width:100%">`;
    endWrap.innerHTML = `<input type="time" id="f-end-time" value="${toTimeInputValue(end, tz)}" style="width:100%">`;
  }

  sheet.querySelector('#f-allday').addEventListener('change', e => {
    const checked = e.target.checked;
    sheet.querySelector('#allday-date-row').style.display = checked ? '' : 'none';
    sheet.querySelector('#time-row').style.display = checked ? 'none' : '';
    if (checked) {
      const sd = sheet.querySelector('#f-start-date');
      if (sd) sheet.querySelector('#f-date').value = sd.value;
    } else {
      const fd = sheet.querySelector('#f-date');
      if (fd) {
        sheet.querySelector('#f-start-date').value = fd.value;
        sheet.querySelector('#f-end-date').value = fd.value;
      }
    }
  });

  // When start date changes, shift end date by the same delta
  const startDateEl = sheet.querySelector('#f-start-date');
  if (startDateEl) {
    let prevStartVal = startDateEl.value;
    startDateEl.addEventListener('change', () => {
      const prev = new Date(prevStartVal + 'T00:00');
      const next = new Date(startDateEl.value + 'T00:00');
      const delta = next.getTime() - prev.getTime();
      const endDateEl = sheet.querySelector('#f-end-date');
      const shifted = new Date(new Date(endDateEl.value + 'T00:00').getTime() + delta);
      endDateEl.value = toDateInputValue(shifted);
      prevStartVal = startDateEl.value;
    });
  }

  sheet.querySelector('#f-save').addEventListener('click', () => handleSave(event));
  sheet.querySelector('#f-cancel').addEventListener('click', closeModal);

  const nlpInput = sheet.querySelector('#f-nlp');
  if (nlpInput) {
    let nlpTimer = null;
    nlpInput.addEventListener('input', () => {
      clearTimeout(nlpTimer);
      nlpTimer = setTimeout(() => applyNlp(nlpInput.value), 320);
    });
  }
  if (!isNew) {
    sheet.querySelector('#f-delete').addEventListener('click', () => {
      const scope = sheet.querySelector('#f-scope')?.value || null;
      closeModal();
      onDeleteCb(event, scope);
    });
    const dupBtn = sheet.querySelector('#f-duplicate');
    if (dupBtn) {
      dupBtn.addEventListener('click', () => {
        closeModal();
        if (onDuplicateCb) onDuplicateCb(event);
      });
    }
  }
  if (isNew) sheet.querySelector('#f-title').focus();
}

function handleSave(event) {
  const title = sheet.querySelector('#f-title').value.trim();
  if (!title) { sheet.querySelector('#f-title').focus(); return; }

  const allDay = sheet.querySelector('#f-allday').checked;
  const calendarId = sheet.querySelector('#f-calendar').value;
  const description = sheet.querySelector('#f-desc').value.trim();

  let startDt, endDt;
  if (allDay) {
    const dateVal = sheet.querySelector('#f-date').value;
    startDt = new Date(`${dateVal}T00:00:00Z`); // UTC midnight — keeps date string unambiguous
    endDt = new Date(startDt.getTime() + 86400000);
  } else {
    const startDateVal = sheet.querySelector('#f-start-date').value;
    const endDateVal = sheet.querySelector('#f-end-date').value;
    const startTime = sheet.querySelector('#f-start-time').value;
    const endTime = sheet.querySelector('#f-end-time').value;
    const tz = state.config.timezone;
    startDt = localToUTC(startDateVal, startTime, tz);
    endDt = localToUTC(endDateVal, endTime, tz);
    if (endDt <= startDt) {
      endDt = new Date(startDt.getTime() + 3600000);
    }
  }

  const nlpRrule = !event ? (sheet.dataset.nlpRrule || null) : null;
  const data = { title, start: startDt.toISOString(), end: endDt.toISOString(), allDay, calendarId, description,
    ...(nlpRrule ? { rrule: nlpRrule } : {}) };
  if (event?.recurring) {
    data.recurringScope = sheet.querySelector('#f-scope')?.value || 'single';
    data.uid = event.uid;
    data.occurrenceDate = event.occurrenceDate;
  }

  closeModal();
  onSaveCb(data);
}

async function applyNlp(text) {
  const fb = sheet.querySelector('#nlp-fb');
  if (!fb || !text.trim()) { if (fb) fb.classList.add('hidden'); return; }
  try {
    const res = await fetch('/nlp/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!data.parsed) { fb.classList.add('hidden'); return; }

    // Update form fields
    sheet.querySelector('#f-title').value = data.title;
    const start = new Date(data.start);
    const end = new Date(data.end);
    const tz = state.config.timezone;
    if (!data.allDay) {
      sheet.querySelector('#f-start-date').value = toDateInputValue(start, tz);
      sheet.querySelector('#f-end-date').value = toDateInputValue(end, tz);
      const startTimeVal = toTimeInputValue(start, tz);
      const endTimeVal   = toTimeInputValue(end, tz);
      // Update both <input type="time"> and the wheel hidden input (24h mode)
      const stEl = sheet.querySelector('#f-start-time');
      const etEl = sheet.querySelector('#f-end-time');
      if (stEl) stEl.value = startTimeVal;
      if (etEl) etEl.value = endTimeVal;
      sheet.querySelector('#f-allday').checked = false;
      sheet.querySelector('#allday-date-row').style.display = 'none';
      sheet.querySelector('#time-row').style.display = '';
    } else {
      sheet.querySelector('#f-date').value = toDateInputValue(start);
      sheet.querySelector('#f-allday').checked = true;
      sheet.querySelector('#allday-date-row').style.display = '';
      sheet.querySelector('#time-row').style.display = 'none';
    }

    // Show feedback
    const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = data.allDay ? 'All day' : `${toTimeInputValue(start)} – ${toTimeInputValue(end)}`;
    fb.textContent = `📅 ${dateStr} · ${timeStr}${data.rrule ? ' · 🔁 Repeats' : ''}`;
    fb.classList.remove('hidden');

    // Store rrule if detected so handleSave can include it
    sheet.dataset.nlpRrule = data.rrule || '';
  } catch {
    fb.classList.add('hidden');
  }
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
