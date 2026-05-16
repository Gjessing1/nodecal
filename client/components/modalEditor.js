import { state } from '../app/state.js';
import { toDateInputValue, toTimeInputValue, localToUTC, esc } from '../app/utils.js';
import { buildTimePicker } from './timePicker.js';
import { buildRecurrenceEditor } from './recurrenceUI.js';
import { buildDatePickerButton, mountLocationUrlSection, mountCollapsibleToggle, wireCategoryUI } from './modalHelpers.js';
import { getAllEventCategories } from '../app/eventUtils.js';

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
 * @param {{ explicitTime?: boolean }} [opts] - explicitTime: use defaultDate time as-is, skip default-time logic
 */
export function openNewEventModal(defaultDate, onSave, { explicitTime = false } = {}) {
  onSaveCb = onSave;
  onDeleteCb = null;
  onDuplicateCb = null;
  renderForm(null, defaultDate, explicitTime);
  sheet.scrollTop = 0;
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
  sheet.scrollTop = 0;
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

const ALARM_PRESETS = [[0,'None'],[5,'5 min before'],[15,'15 min before'],[60,'1 hour before']];
function alarmOptionsHtml(currentMinutes) {
  const known = ALARM_PRESETS.map(([v]) => v);
  const isCustom = currentMinutes != null && currentMinutes > 0 && !known.includes(currentMinutes);
  return ALARM_PRESETS.map(([v, l]) =>
    `<option value="${v}"${(currentMinutes ?? 0) === v ? ' selected' : ''}>${esc(l)}</option>`
  ).join('') + `<option value="-1"${isCustom ? ' selected' : ''}>Custom…</option>`;
}

let _nlpReqId = 0;

function renderForm(event, defaultDate, explicitTime = false) {
  // Clear stale NLP state from any previous modal session
  sheet.dataset.nlpRaw = '';
  sheet.dataset.nlpTitle = '';
  sheet.dataset.nlpRrule = '';

  const isNew = !event;
  const tz = state.config.timezone;
  const durMs = (state.config.defaultEventDuration || 60) * 60000;
  const start = event ? new Date(event.start) : (explicitTime && defaultDate ? defaultDate : computeDefaultStart(defaultDate || new Date(), tz));
  const end = event ? new Date(event.end) : new Date(start.getTime() + durMs);
  // For all-day events, slice the UTC date string directly — never convert through local timezone.
  const allDayDateVal = event?.allDay ? event.start.slice(0, 10) : toDateInputValue(start, tz);
  // Default calendar: prefer event's calendar, then settings default, then first available
  const defaultCalId = event?.calendarId || state.config.defaultCalendar || state.calendars[0]?.id;

  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-field">
      <label>Title</label>
      <div class="modal-title-input-row">
        <input type="text" id="f-title" value="${esc(event?.title || '')}" placeholder="${isNew ? 'e.g. Meeting tomorrow 14:00' : 'Event title'}" autocomplete="off">
        ${!isNew ? '<button type="button" class="btn btn-ghost icon-btn" id="f-duplicate" title="Duplicate event">⧉</button>' : ''}
      </div>
      ${isNew ? '<div class="nlp-feedback hidden" id="nlp-fb"></div>' : ''}
    </div>
    <div class="modal-field" id="allday-date-row"${!event?.allDay ? ' style="display:none"' : ''}>
      <label>Date</label>
      <input type="hidden" id="f-date" value="${allDayDateVal}">
      <div id="f-date-wrap"></div>
    </div>
    <div class="modal-datetime-row" id="time-row"${event?.allDay ? ' style="display:none"' : ''}>
      <div class="datetime-col">
        <label class="datetime-label">From</label>
        <input type="hidden" id="f-start-date" value="${toDateInputValue(start, tz)}">
        <div id="f-start-date-wrap"></div>
        <div id="f-start-time-wrap"></div>
      </div>
      <span class="datetime-arrow">→</span>
      <div class="datetime-col">
        <label class="datetime-label">To</label>
        <input type="hidden" id="f-end-date" value="${toDateInputValue(end, tz)}">
        <div id="f-end-date-wrap"></div>
        <div id="f-end-time-wrap"></div>
      </div>
    </div>
    <div class="modal-cal-allday-row">
      <div class="modal-field modal-cal-field">
        <label>Calendar</label>
        <select id="f-calendar">
          ${state.calendars.map(c => `<option value="${esc(c.id)}" ${defaultCalId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="modal-allday-toggle">
        <label for="f-allday">All day</label>
        <input type="checkbox" id="f-allday" ${event?.allDay ? 'checked' : ''}>
      </div>
    </div>
    <div class="modal-collapsibles-row">
      <div id="f-rr-toggle" class="collapsible-field-wrap"></div>
      <div id="f-location-url-wrap" class="collapsible-field-wrap"></div>
    </div>
    <div id="f-rr-body">
      <div class="modal-row">
        <div class="modal-field">
          <label>Remind me</label>
          <select id="f-alarm">
            ${alarmOptionsHtml(event?.alarmMinutes ?? (state.config.alarmDefaultMinutes ?? 0))}
          </select>
        </div>
        <div class="modal-field">
          <label>Repeat</label>
          <div id="f-repeat-preset-target"></div>
        </div>
      </div>
      <div class="modal-field" id="f-alarm-custom-row" style="${(()=>{const v=event?.alarmMinutes??state.config.alarmDefaultMinutes??0;return [0,5,15,60].includes(v)?'display:none':''})()}">
        <label>Minutes before</label>
        <input type="number" id="f-alarm-custom" value="${(()=>{const v=event?.alarmMinutes??state.config.alarmDefaultMinutes??0;return [0,5,15,60].includes(v)?'':(v||'')})()}" min="1" max="10080" placeholder="e.g. 45">
      </div>
      <div id="f-repeat-container" data-rrule="${esc(event?.rrule || '')}"></div>
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
    <div id="f-categories-section"></div>
    <div class="modal-field">
      <label>Description</label>
      <textarea id="f-desc" rows="5">${esc(event?.description || '')}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="f-save">Save</button>
      ${!isNew && onDeleteCb ? '<button class="btn btn-danger" id="f-delete">Delete</button>' : ''}
      <button class="btn btn-ghost" id="f-cancel">Cancel</button>
    </div>
  `;

  // Insert time widgets after innerHTML so DOM elements can be appended
  const startWrap = sheet.querySelector('#f-start-time-wrap');
  const endWrap = sheet.querySelector('#f-end-time-wrap');

  // ── Date picker buttons ──────────────────────────────────────────────────────
  buildDatePickerButton(sheet.querySelector('#f-date'),       sheet.querySelector('#f-date-wrap'));
  buildDatePickerButton(sheet.querySelector('#f-start-date'), sheet.querySelector('#f-start-date-wrap'));
  buildDatePickerButton(sheet.querySelector('#f-end-date'),   sheet.querySelector('#f-end-date-wrap'));

  // ── Helper: shift end time by same delta when start changes ──────────────────
  function shiftEnd(prevStartVal, newStartVal) {
    const [ph, pm] = prevStartVal.split(':').map(Number);
    const [nh, nm] = newStartVal.split(':').map(Number);
    const deltaMin = (nh * 60 + nm) - (ph * 60 + pm);
    const endEl = sheet.querySelector('#f-end-time');
    if (!endEl) return;
    const [eh, em] = endEl.value.split(':').map(Number);
    const newEndMin = Math.max(0, Math.min(1439, (eh * 60 + em) + deltaMin));
    const newEndVal = `${String(Math.floor(newEndMin / 60)).padStart(2, '0')}:${String(newEndMin % 60).padStart(2, '0')}`;
    endEl.value = newEndVal;
    sheet.querySelector('#f-end-time-wrap .tp-wrap')?.updateTime?.(newEndVal);
  }

  // ── Time pickers (dial, all platforms) ───────────────────────────────────────
  let prevStartVal = toTimeInputValue(start, tz);
  startWrap.appendChild(buildTimePicker('f-start-time', start, tz, newVal => {
    shiftEnd(prevStartVal, newVal);
    prevStartVal = newVal;
  }));
  endWrap.appendChild(buildTimePicker('f-end-time', end, tz));

  sheet.querySelector('#f-allday').addEventListener('change', e => {
    const checked = e.target.checked;
    sheet.querySelector('#allday-date-row').style.display = checked ? '' : 'none';
    sheet.querySelector('#time-row').style.display = checked ? 'none' : '';
    if (checked) {
      const sd = sheet.querySelector('#f-start-date');
      if (sd) {
        sheet.querySelector('#f-date').value = sd.value;
        sheet.querySelector('#f-date').dispatchEvent(new Event('change'));
      }
    } else {
      const fd = sheet.querySelector('#f-date');
      if (fd) {
        sheet.querySelector('#f-start-date').value = fd.value;
        sheet.querySelector('#f-end-date').value = fd.value;
        sheet.querySelector('#f-start-date').dispatchEvent(new Event('change'));
        sheet.querySelector('#f-end-date').dispatchEvent(new Event('change'));
      }
    }
  });

  // ── Location / URL (collapsible) ─────────────────────────────────────────
  mountLocationUrlSection(sheet.querySelector('#f-location-url-wrap'), {
    locId: 'f-location', urlId: 'f-url',
    initLoc: event?.location || '', initUrl: event?.url || '',
    showUrlLink: true,
  });

  // ── Reminder / Repeat collapse when unused ────────────────────────────────
  const _alarmVal = event?.alarmMinutes ?? state.config.alarmDefaultMinutes ?? 0;
  mountCollapsibleToggle(
    sheet.querySelector('#f-rr-toggle'),
    sheet.querySelector('#f-rr-body'),
    { label: '+ Reminder / Repeat', hasContent: !!(_alarmVal > 0 || event?.rrule) }
  );

  // Alarm select → show/hide custom minutes row
  const alarmSel = sheet.querySelector('#f-alarm');
  const alarmCustomRow = sheet.querySelector('#f-alarm-custom-row');
  if (alarmSel && alarmCustomRow) {
    alarmSel.addEventListener('change', () => {
      alarmCustomRow.style.display = alarmSel.value === '-1' ? '' : 'none';
    });
  }

  // ── Recurrence editor (declared before startDate listener so the listener can reference it)
  let recEditor = null;
  const recContainer = sheet.querySelector('#f-repeat-container');
  if (recContainer) {
    recEditor = buildRecurrenceEditor(
      start,
      event?.rrule || null,
      (newRrule) => { recContainer.dataset.rrule = newRrule || ''; },
      { presetContainer: sheet.querySelector('#f-repeat-preset-target') }
    );
    recContainer.appendChild(recEditor);
  }

  // When start date changes: shift end date + notify recurrence editor
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
      recEditor?.onStartDateChange?.(next);
    });
  }

  // ── Categories ────────────────────────────────────────────────────────────
  const catSection = sheet.querySelector('#f-categories-section');
  if (catSection) {
    const modalCats = [...(event?.categories || [])];
    const hiddenEvCats = state.config.hiddenEventCategories || [];
    const allCats   = getAllEventCategories(state.events).filter(c => !hiddenEvCats.includes(c));

    catSection.className = 'modal-field';

    // Toggle header + collapsible body
    const catToggleEl = document.createElement('div');
    catToggleEl.className = 'collapsible-field-wrap';
    const catBodyEl = document.createElement('div');
    catSection.append(catToggleEl, catBodyEl);
    mountCollapsibleToggle(catToggleEl, catBodyEl, {
      label: 'Categories',
      hasContent: modalCats.length > 0,
    });

    const chipsEl  = document.createElement('div');
    chipsEl.className = 'tm-cats-chips-inline';
    const catInput = document.createElement('input');
    catInput.type = 'text'; catInput.placeholder = 'Add category…'; catInput.autocomplete = 'off';
    const addBtn   = document.createElement('button');
    addBtn.type = 'button'; addBtn.className = 'btn btn-ghost tm-cat-add-btn'; addBtn.textContent = '+';
    const autoList = document.createElement('ul');
    autoList.className = 'tasks-autocomplete tm-cat-autocomplete'; autoList.style.display = 'none';

    const inputWrap = document.createElement('div');
    inputWrap.className = 'tm-cats-combined';
    inputWrap.append(chipsEl, catInput, addBtn, autoList);
    catBodyEl.appendChild(inputWrap);

    const catCtrl = wireCategoryUI(chipsEl, catInput, addBtn, autoList, modalCats, allCats, {
      onAdd:    () => refreshBatchShift(),
      onRemove: () => refreshBatchShift(),
    });

    // Batch shift (collapsible, shown only when there are categories)
    const batchToggle = document.createElement('div');
    batchToggle.className = 'collapsible-field-wrap';
    const batchBody = document.createElement('div');
    batchBody.className = 'hidden';

    function refreshBatchShift() {
      batchToggle.innerHTML = ''; batchBody.innerHTML = '';
      if (!modalCats.length) return;
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button'; toggleBtn.className = 'add-field-btn';
      toggleBtn.textContent = '+ Batch shift';
      let open = false;
      toggleBtn.addEventListener('click', () => {
        open = !open; batchBody.classList.toggle('hidden', !open);
          toggleBtn.textContent = open ? '− Batch shift' : '+ Batch shift';
      });
      batchToggle.appendChild(toggleBtn);

      for (const cat of modalCats) {
        const row = document.createElement('div');
        row.className = 'batch-shift-row';
        const catLabel = document.createElement('span');
        catLabel.className = 'task-cat-chip'; catLabel.textContent = cat;

        const nInput = document.createElement('input');
        nInput.type = 'number'; nInput.min = '-365'; nInput.max = '365';
        nInput.className = 'rec-interval-input'; nInput.value = '7';
        const unitSel = document.createElement('select');
        unitSel.className = 'rec-freq-sel';
        for (const [v, l] of [['1','day(s)'],['7','week(s)']]) {
          const o = document.createElement('option'); o.value = v; o.textContent = l; unitSel.appendChild(o);
        }
        const futureBtn = document.createElement('button');
        futureBtn.type = 'button'; futureBtn.className = 'btn btn-primary batch-shift-apply';
        futureBtn.textContent = 'Shift future';
        const allBtn = document.createElement('button');
        allBtn.type = 'button'; allBtn.className = 'btn btn-ghost batch-shift-apply';
        allBtn.textContent = 'Shift all';
        const status = document.createElement('span');
        status.className = 'batch-shift-status';

        async function doShift(withAnchor) {
          const n = parseInt(nInput.value) || 7;
          const multiplier = parseInt(unitSel.value) || 1;
          const shiftDays = n * multiplier;
          futureBtn.disabled = true; allBtn.disabled = true; status.textContent = '…';
          try {
            const body = { category: cat, shiftDays };
            if (withAnchor) {
              const anchorDate = event?.occurrenceDate || event?.start || null;
              if (anchorDate) body.anchorDate = anchorDate;
            }
            const r = await fetch('/events/batch-shift', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            const data = await r.json();
            if (!data.ok) throw new Error(data.error);
            if (data.total === 0) {
              status.textContent = '✗ No events found';
            } else if (!data.shifted && data.errors?.length) {
              status.textContent = `✗ ${data.errors[0].error}`;
            } else {
              status.textContent = `✓ ${data.shifted}/${data.total} shifted${data.skipped ? ` (${data.skipped} skipped)` : ''}`;
            }
          } catch (err) {
            status.textContent = '✗ ' + err.message;
          } finally {
            futureBtn.disabled = false; allBtn.disabled = false;
          }
        }
        futureBtn.addEventListener('click', () => doShift(true));
        allBtn.addEventListener('click', () => doShift(false));

        const controls = document.createElement('div');
        controls.className = 'batch-shift-controls';
        controls.append(nInput, unitSel, futureBtn, allBtn, status);
        row.append(catLabel, controls);
        batchBody.appendChild(row);
      }
    }
    refreshBatchShift();
    catSection.append(batchToggle, batchBody);

    // Store reference so handleSave can read categories
    catSection._getCategories = catCtrl.getCategories;
  }

  sheet.querySelector('#f-save').addEventListener('click', () => handleSave(event));
  sheet.querySelector('#f-cancel').addEventListener('click', closeModal);

  if (isNew) {
    const titleInput = sheet.querySelector('#f-title');
    let nlpTimer = null;
    titleInput.addEventListener('input', () => {
      clearTimeout(nlpTimer);
      nlpTimer = setTimeout(() => applyNlp(titleInput.value), 320);
    });
  }
  if (!isNew && onDeleteCb) {
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
  const rawTitle = sheet.querySelector('#f-title').value.trim();
  if (!rawTitle) { sheet.querySelector('#f-title').focus(); return; }
  // If the user hasn't changed the input since NLP parsed it, use the stripped title
  const title = (sheet.dataset.nlpRaw && rawTitle === sheet.dataset.nlpRaw && sheet.dataset.nlpTitle)
    ? sheet.dataset.nlpTitle
    : rawTitle;

  const allDay = sheet.querySelector('#f-allday').checked;
  const calendarId = sheet.querySelector('#f-calendar').value;
  const description = sheet.querySelector('#f-desc').value.trim();
  const location = sheet.querySelector('#f-location-url-wrap #f-location')?.value.trim() || '';
  const url      = sheet.querySelector('#f-location-url-wrap #f-url')?.value.trim() || '';

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

  // Determine rrule: editor takes precedence over NLP detection
  const recCont   = sheet.querySelector('#f-repeat-container');
  const editorRrule = recCont ? (recCont.dataset.rrule || null) : undefined;
  const nlpRrule  = !event ? (sheet.dataset.nlpRrule || null) : null;
  const rrule = editorRrule !== undefined ? editorRrule : nlpRrule;

  const alarmSelVal  = sheet.querySelector('#f-alarm')?.value || '0';
  const alarmMinutes = alarmSelVal === '-1'
    ? (parseInt(sheet.querySelector('#f-alarm-custom')?.value || '0') || null)
    : (parseInt(alarmSelVal) > 0 ? parseInt(alarmSelVal) : null);

  const categories = sheet.querySelector('#f-categories-section')?._getCategories?.() || (event?.categories || []);
  const data = { title, start: startDt.toISOString(), end: endDt.toISOString(), allDay, calendarId, description, location, url,
    rrule: rrule || null, alarmMinutes, categories };
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
  const reqId = ++_nlpReqId;
  try {
    const res = await fetch('/nlp/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (reqId !== _nlpReqId) return; // stale — a newer request is in flight
    const data = await res.json();
    if (!data.parsed) { fb.classList.add('hidden'); sheet.dataset.nlpRaw = ''; return; }

    // Update date/time fields only — title field is the input, don't overwrite it
    sheet.dataset.nlpTitle = data.title;
    sheet.dataset.nlpRaw   = text;
    const start = new Date(data.start);
    const end = new Date(data.end);
    const tz = state.config.timezone;
    if (!data.allDay) {
      const sdEl = sheet.querySelector('#f-start-date');
      const edEl = sheet.querySelector('#f-end-date');
      if (sdEl) { sdEl.value = toDateInputValue(start, tz); sdEl.dispatchEvent(new Event('change')); }
      if (edEl) { edEl.value = toDateInputValue(end, tz);   edEl.dispatchEvent(new Event('change')); }
      const startTimeVal = toTimeInputValue(start, tz);
      const endTimeVal   = toTimeInputValue(end, tz);
      // Update hidden inputs
      const stEl = sheet.querySelector('#f-start-time');
      const etEl = sheet.querySelector('#f-end-time');
      if (stEl) stEl.value = startTimeVal;
      if (etEl) etEl.value = endTimeVal;
      // Update visual dial display if present
      sheet.querySelector('#f-start-time-wrap .tp-wrap')?.updateTime?.(startTimeVal);
      sheet.querySelector('#f-end-time-wrap .tp-wrap')?.updateTime?.(endTimeVal);
      sheet.querySelector('#f-allday').checked = false;
      sheet.querySelector('#allday-date-row').style.display = 'none';
      sheet.querySelector('#time-row').style.display = '';
    } else {
      const fdEl = sheet.querySelector('#f-date');
      if (fdEl) { fdEl.value = toDateInputValue(start); fdEl.dispatchEvent(new Event('change')); }
      sheet.querySelector('#f-allday').checked = true;
      sheet.querySelector('#allday-date-row').style.display = '';
      sheet.querySelector('#time-row').style.display = 'none';
    }

    // Show feedback with the recognized text highlighted inline
    const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
    const timeStr = data.allDay ? 'All day' : `${toTimeInputValue(start, tz)} – ${toTimeInputValue(end, tz)}`;
    const rruleTag = data.rrule ? ' · Repeats' : '';
    fb.innerHTML = '';
    // If parsedText is available, show "recognized: <blue span>" before the summary
    if (data.parsedText) {
      const rawInput = text;
      const idx = rawInput.toLowerCase().indexOf(data.parsedText.toLowerCase());
      if (idx !== -1) {
        const before = document.createTextNode(rawInput.slice(0, idx));
        const match  = document.createElement('mark');
        match.className = 'nlp-match';
        match.textContent = rawInput.slice(idx, idx + data.parsedText.length);
        const after  = document.createTextNode(rawInput.slice(idx + data.parsedText.length));
        const inputPreview = document.createElement('div');
        inputPreview.className = 'nlp-input-preview';
        inputPreview.appendChild(before);
        inputPreview.appendChild(match);
        inputPreview.appendChild(after);
        fb.appendChild(inputPreview);
      }
    }
    const summary = document.createElement('div');
    summary.textContent = `${dateStr} · ${timeStr}${rruleTag}`;
    fb.appendChild(summary);
    fb.classList.remove('hidden');

    // Store rrule if detected so handleSave can include it
    sheet.dataset.nlpRrule = data.rrule || '';
  } catch {
    fb.classList.add('hidden');
  }
}
