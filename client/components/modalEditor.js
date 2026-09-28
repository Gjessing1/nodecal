import { state, calendarById } from '../app/state.js';
import { mountBatchShift } from './batchShift.js';
import { toDateInputValue, toTimeInputValue, esc } from '../app/utils.js';
import { buildRecurrenceEditor } from './recurrenceUI.js';
import { eventDateFieldsHtml, mountEventDateFields } from './eventDateFields.js';
import { allDayLastDay, nlpEventEnd } from './eventTimes.js';
import {
  mountLocationUrlSection,
  mountCollapsibleToggle,
  wireCategoryUI,
  scopeFieldHtml,
} from './modalHelpers.js';
import { getAllEventCategories } from '../app/eventUtils.js';
import { eventCalendars, resolveEditorCalendar } from '../app/profileTargets.js';
import { showDeleteScopeDialog } from './deleteScopeDialog.js';
import { trapFocus } from './focusTrap.js';
import { todayLabel } from '../app/dayWindow.js';
import { computeDefaultStart } from './defaultStart.js';

let overlay, sheet, onSaveCb, onDeleteCb, onDuplicateCb, onEventsChangedCb;
/** @type {(() => void)|null} */
let releaseTrap = null;
/** @type {ReturnType<typeof mountEventDateFields>|null} */
let dateFields = null;

/**
 * @param {(message: string) => void} [onEventsChanged] - called when something
 *   inside the modal changed events behind the app's back (batch shift), so the
 *   app can refetch and re-render instead of waiting for the next poll.
 */
export function initModal(onEventsChanged) {
  onEventsChangedCb = onEventsChanged;
  overlay = document.getElementById('modal-overlay');
  sheet = overlay.querySelector('.modal-sheet');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}

/**
 * Open the modal for creating a new event.
 * @param {Date} defaultDate
 * @param {(data: any) => void} onSave
 * @param {{ explicitTime?: boolean }} [opts] - explicitTime: use defaultDate time as-is, skip default-time logic
 */
export function openNewEventModal(defaultDate, onSave, { explicitTime = false } = {}) {
  onSaveCb = onSave;
  onDeleteCb = null;
  onDuplicateCb = null;
  renderForm(null, defaultDate, explicitTime);
  showSheet('New event');
}

/**
 * Open the modal for editing an existing event.
 * @param {object} event
 * @param {(data: any) => void} onSave
 * @param {(event: any, scope?: string) => void} onDelete
 * @param {(event: any) => void} [onDuplicate]
 */
export function openEditEventModal(event, onSave, onDelete, onDuplicate) {
  onSaveCb = onSave;
  onDeleteCb = onDelete;
  onDuplicateCb = onDuplicate || null;
  renderForm(event, null);
  showSheet('Edit event');
}

/**
 * Open a read-only view of an event (used for subscribed ICS feed calendars,
 * which have no CalDAV write path). No editable fields, no Save/Delete.
 * @param {object} event
 */
export function openReadOnlyEventModal(event) {
  onSaveCb = null;
  onDeleteCb = null;
  onDuplicateCb = null;
  renderReadOnly(event);
  showSheet('Event details');
}

/**
 * Reveal the sheet and hand it the keyboard. Focus lands on the sheet itself,
 * not on the title field: this is a phone-first app and focusing a text input
 * would raise the on-screen keyboard over the form every time a modal opens.
 * @param {string} label - accessible name for the dialog
 */
function showSheet(label) {
  sheet.scrollTop = 0;
  overlay.classList.remove('hidden');
  if (releaseTrap) releaseTrap();
  releaseTrap = trapFocus(sheet, { watchEl: overlay, label, onEscape: closeModal });
}

export function closeModal() {
  overlay.classList.add('hidden');
  if (releaseTrap) releaseTrap();
  releaseTrap = null;
}

function formatEventWhen(event) {
  const tz = state.config.timezone;
  const opts = /** @type {Intl.DateTimeFormatOptions} */ ({
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz,
  });
  if (event.allDay) {
    const d = new Date(event.start.slice(0, 10) + 'T00:00:00Z');
    return d.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' }) + ' · All day';
  }
  const start = new Date(event.start);
  const end = new Date(event.end);
  const dateStr = start.toLocaleDateString('en-US', opts);
  const t = (d) =>
    d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: state.config.timeFormat === '12h',
      timeZone: tz,
    });
  return `${dateStr} · ${t(start)} – ${t(end)}`;
}

function renderReadOnly(event) {
  const cal = calendarById(event.calendarId);
  const rows = [];
  rows.push(`
    <div class="modal-handle"></div>
    <div class="modal-field">
      <div class="modal-title">${esc(event.title || '(No title)')}</div>
      <div class="readonly-badge">${state.isOffline ? 'Offline copy · Read-only' : 'Read-only'} · ${esc(cal?.name || 'Calendar')}</div>
    </div>
    <div class="readonly-row"><span class="readonly-when">${esc(formatEventWhen(event))}</span></div>`);
  if (event.location) {
    rows.push(
      `<div class="readonly-row"><span class="readonly-label">Location</span> ${esc(event.location)}</div>`,
    );
  }
  if (event.url) {
    rows.push(
      `<div class="readonly-row"><span class="readonly-label">URL</span> <a href="${esc(event.url)}" target="_blank" rel="noopener">${esc(event.url)}</a></div>`,
    );
  }
  if (event.description) {
    rows.push(`<div class="readonly-row readonly-desc">${esc(event.description)}</div>`);
  }
  rows.push(`
    <div class="modal-actions">
      <button class="btn btn-ghost" id="f-close">Close</button>
    </div>`);
  sheet.innerHTML = rows.join('');
  sheet.querySelector('#f-close').addEventListener('click', closeModal);
}

const ALARM_PRESETS = [
  [0, 'None'],
  [5, '5 min before'],
  [15, '15 min before'],
  [60, '1 hour before'],
];
function alarmOptionsHtml(currentMinutes) {
  const known = ALARM_PRESETS.map(([v]) => v);
  const isCustom = currentMinutes != null && currentMinutes > 0 && !known.includes(currentMinutes);
  return (
    ALARM_PRESETS.map(
      ([v, l]) =>
        `<option value="${v}"${(currentMinutes ?? 0) === v ? ' selected' : ''}>${esc(l)}</option>`,
    ).join('') + `<option value="-1"${isCustom ? ' selected' : ''}>Custom…</option>`
  );
}

let _nlpReqId = 0;

function renderForm(event, defaultDate, explicitTime = false) {
  // Clear stale NLP state from any previous modal session
  sheet.dataset.nlpRaw = '';
  sheet.dataset.nlpTitle = '';
  sheet.dataset.nlpRrule = '';

  const isNew = !event;
  const tz = state.config.timezone;
  const durationMinutes = state.config.defaultEventDuration || 60;
  const durMs = durationMinutes * 60000;
  let start;
  if (event && !event.allDay) {
    start = new Date(event.start);
  } else if (event) {
    // An all-day event's UTC midnight is no time of day; seed the timed fields
    // (shown if all-day is switched off) with the usual default start instead.
    const [y, m, d] = event.start.slice(0, 10).split('-').map(Number);
    start = computeDefaultStart(new Date(y, m - 1, d), tz, state.config.defaultEventTime);
  } else if (explicitTime && defaultDate) {
    start = defaultDate;
  } else {
    start = computeDefaultStart(defaultDate || todayLabel(tz), tz, state.config.defaultEventTime);
  }
  let end = new Date(start.getTime() + durMs);
  if (event && !event.allDay) end = new Date(event.end);
  // For all-day events, slice the UTC date string directly — never convert through local timezone.
  const allDayStart = event?.allDay ? event.start.slice(0, 10) : toDateInputValue(start, tz);
  const dateInit = {
    allDay: !!event?.allDay,
    allDayStart,
    allDayLast: event?.allDay ? allDayLastDay(event.start, event.end) : allDayStart,
    start,
    end,
    tz,
  };
  // Default calendar: prefer event's calendar, then the profile/global default, then first available
  const defaultCalId = event?.calendarId || resolveEditorCalendar();

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
    ${eventDateFieldsHtml(dateInit)}
    <div class="modal-cal-allday-row">
      <div class="modal-field modal-cal-field">
        <label>Calendar</label>
        <select id="f-calendar">
          ${eventCalendars(event?.calendarId)
            .map(
              (c) =>
                `<option value="${esc(c.id)}" ${defaultCalId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <div class="modal-allday-toggle">
        <label for="f-allday">All day</label>
        <input type="checkbox" id="f-allday" ${event?.allDay ? 'checked' : ''}>
      </div>
    </div>
    <div class="modal-field">
      <label>Description</label>
      <textarea id="f-desc" rows="4">${esc(event?.description || '')}</textarea>
    </div>
    <div class="modal-collapsibles-row">
      <div id="f-rr-toggle" class="collapsible-field-wrap"></div>
      <div id="f-location-url-wrap" class="collapsible-field-wrap"></div>
      <div id="f-categories-section" class="collapsible-field-wrap"></div>
    </div>
    <div id="f-rr-body">
      <div class="modal-row">
        <div class="modal-field">
          <label>Remind me</label>
          <select id="f-alarm">
            ${alarmOptionsHtml(event?.alarmMinutes ?? state.config.alarmDefaultMinutes ?? 0)}
          </select>
        </div>
        <div class="modal-field">
          <label>Repeat</label>
          <div id="f-repeat-preset-target"></div>
        </div>
      </div>
      <div class="modal-field" id="f-alarm-custom-row" style="${(() => {
        const v = event?.alarmMinutes ?? state.config.alarmDefaultMinutes ?? 0;
        return [0, 5, 15, 60].includes(v) ? 'display:none' : '';
      })()}">
        <label>Minutes before</label>
        <input type="number" id="f-alarm-custom" value="${(() => {
          const v = event?.alarmMinutes ?? state.config.alarmDefaultMinutes ?? 0;
          return [0, 5, 15, 60].includes(v) ? '' : v || '';
        })()}" min="1" max="10080" placeholder="e.g. 45">
      </div>
      <div id="f-repeat-container" data-rrule="${esc(event?.rrule || '')}"></div>
    </div>
    ${scopeFieldHtml(event)}
    <div class="modal-actions">
      <button class="btn btn-primary" id="f-save">Save</button>
      ${!isNew && onDeleteCb ? '<button class="btn btn-danger" id="f-delete">Delete</button>' : ''}
      <button class="btn btn-ghost" id="f-cancel">Cancel</button>
    </div>
  `;

  // ── Location / URL (collapsible) ─────────────────────────────────────────
  mountLocationUrlSection(sheet.querySelector('#f-location-url-wrap'), {
    locId: 'f-location',
    urlId: 'f-url',
    initLoc: event?.location || '',
    initUrl: event?.url || '',
    showUrlLink: true,
  });

  // ── Reminder / Repeat collapse when unused ────────────────────────────────
  const _alarmVal = event?.alarmMinutes ?? state.config.alarmDefaultMinutes ?? 0;
  // Collapsed even when a reminder or rule is set — the form is long enough on a
  // phone without it, and the header dot says the section is not empty.
  mountCollapsibleToggle(sheet.querySelector('#f-rr-toggle'), sheet.querySelector('#f-rr-body'), {
    label: '+ Reminder / Repeat',
    hasContent: !!(_alarmVal > 0 || event?.rrule),
    defaultExpanded: false,
  });

  // Alarm select → show/hide custom minutes row
  const alarmSel = sheet.querySelector('#f-alarm');
  const alarmCustomRow = sheet.querySelector('#f-alarm-custom-row');
  if (alarmSel && alarmCustomRow) {
    alarmSel.addEventListener('change', () => {
      alarmCustomRow.style.display = alarmSel.value === '-1' ? '' : 'none';
    });
  }

  // ── Recurrence editor (declared before the date fields so they can notify it)
  let recEditor = null;
  const recContainer = sheet.querySelector('#f-repeat-container');
  if (recContainer) {
    recEditor = buildRecurrenceEditor(
      start,
      event?.rrule || null,
      (newRrule) => {
        recContainer.dataset.rrule = newRrule || '';
      },
      { presetContainer: sheet.querySelector('#f-repeat-preset-target') },
    );
    recContainer.appendChild(recEditor);
  }

  // ── From/To fields (see eventDateFields.js) ─────────────────────────────────
  dateFields = mountEventDateFields(sheet, {
    ...dateInit,
    defaultDurationMinutes: durationMinutes,
    onStartDateChange: function notifyRecurrence(d) {
      recEditor?.onStartDateChange?.(d);
    },
  });

  // ── Categories ────────────────────────────────────────────────────────────
  const catSection = sheet.querySelector('#f-categories-section');
  if (catSection) {
    const modalCats = [...(event?.categories || [])];
    const hiddenEvCats = state.config.hiddenEventCategories || [];
    const allCats = getAllEventCategories(state.events).filter((c) => !hiddenEvCats.includes(c));

    // Toggle header + collapsible body (catSection is already in modal-collapsibles-row)
    const catToggleEl = document.createElement('div');
    const catBodyEl = document.createElement('div');
    catSection.append(catToggleEl, catBodyEl);
    mountCollapsibleToggle(catToggleEl, catBodyEl, {
      label: 'Categories',
      hasContent: modalCats.length > 0,
      defaultExpanded: false,
      onToggle: (expanded) => catSection.classList.toggle('collapsible-expanded', expanded),
    });

    const chipsEl = document.createElement('div');
    chipsEl.className = 'tm-cats-chips-inline';
    const catInput = document.createElement('input');
    catInput.type = 'text';
    catInput.placeholder = 'Add category…';
    catInput.autocomplete = 'off';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-ghost tm-cat-add-btn';
    addBtn.textContent = '+';
    const autoList = document.createElement('ul');
    autoList.className = 'tasks-autocomplete tm-cat-autocomplete';
    autoList.style.display = 'none';

    const inputWrap = document.createElement('div');
    inputWrap.className = 'tm-cats-combined';
    inputWrap.append(chipsEl, catInput, addBtn, autoList);
    catBodyEl.appendChild(inputWrap);

    const catCtrl = wireCategoryUI(chipsEl, catInput, addBtn, autoList, modalCats, allCats, {
      onAdd: () => refreshBatchShift(),
      onRemove: () => refreshBatchShift(),
    });

    // Batch shift lives in its own module — see components/batchShift.js.
    const refreshBatchShift = mountBatchShift(catSection, {
      getCategories: () => modalCats,
      getAnchorDate: () => event?.occurrenceDate || event?.start || null,
      onShifted: (message) => {
        closeModal();
        onEventsChangedCb?.(message);
      },
    });

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
    sheet.querySelector('#f-delete').addEventListener('click', async () => {
      if (event?.recurring) {
        // Recurring: ask explicitly which occurrences to remove
        const scope = await showDeleteScopeDialog();
        if (!scope) return; // cancelled
        closeModal();
        onDeleteCb(event, scope);
      } else {
        if (!confirm('Delete this event?')) return;
        closeModal();
        onDeleteCb(event, null);
      }
    });
    const dupBtn = sheet.querySelector('#f-duplicate');
    if (dupBtn) {
      dupBtn.addEventListener('click', () => {
        closeModal();
        if (onDuplicateCb) onDuplicateCb(event);
      });
    }
  }
}

function handleSave(event) {
  const rawTitle = sheet.querySelector('#f-title').value.trim();
  if (!rawTitle) {
    sheet.querySelector('#f-title').focus();
    return;
  }
  // If the user hasn't changed the input since NLP parsed it, use the stripped title
  const title =
    sheet.dataset.nlpRaw && rawTitle === sheet.dataset.nlpRaw && sheet.dataset.nlpTitle
      ? sheet.dataset.nlpTitle
      : rawTitle;

  const calendarId = sheet.querySelector('#f-calendar').value;
  const description = sheet.querySelector('#f-desc').value.trim();
  const location = sheet.querySelector('#f-location-url-wrap #f-location')?.value.trim() || '';
  const url = sheet.querySelector('#f-location-url-wrap #f-url')?.value.trim() || '';

  // An end before the start is shown under the fields and keeps the modal open,
  // rather than being quietly replaced by some other length.
  const when = dateFields.read();
  if (!when) return;
  const { allDay, start: startDt, end: endDt } = when;

  // Determine rrule: editor takes precedence over NLP detection
  const recCont = sheet.querySelector('#f-repeat-container');
  const editorRrule = recCont ? recCont.dataset.rrule || null : undefined;
  const nlpRrule = !event ? sheet.dataset.nlpRrule || null : null;
  const rrule = editorRrule !== undefined ? editorRrule : nlpRrule;

  const alarmSelVal = sheet.querySelector('#f-alarm')?.value || '0';
  const alarmMinutes =
    alarmSelVal === '-1'
      ? parseInt(sheet.querySelector('#f-alarm-custom')?.value || '0') || null
      : parseInt(alarmSelVal) > 0
        ? parseInt(alarmSelVal)
        : null;

  const categories =
    sheet.querySelector('#f-categories-section')?._getCategories?.() || event?.categories || [];
  const data = {
    title,
    start: startDt.toISOString(),
    end: endDt.toISOString(),
    allDay,
    calendarId,
    description,
    location,
    url,
    rrule: rrule || null,
    alarmMinutes,
    categories,
  };
  if (event?.recurring) {
    // An occurrence that already has an override is only ever edited as itself —
    // there is no scope select to read, and "this and following" would cap the
    // series at a moved start rather than at the occurrence it replaces.
    data.recurringScope = event.recurrenceId
      ? 'single'
      : sheet.querySelector('#f-scope')?.value || 'single';
    data.uid = event.uid;
    data.occurrenceDate = event.occurrenceDate;
    data.recurrenceId = event.recurrenceId || null;
  }

  closeModal();
  onSaveCb(data);
}

async function applyNlp(text) {
  const fb = sheet.querySelector('#nlp-fb');
  if (!fb || !text.trim()) {
    if (fb) fb.classList.add('hidden');
    return;
  }
  const reqId = ++_nlpReqId;
  try {
    const res = await fetch('/api/nlp/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (reqId !== _nlpReqId) return; // stale — a newer request is in flight
    const data = await res.json();
    if (!data.parsed) {
      fb.classList.add('hidden');
      sheet.dataset.nlpRaw = '';
      return;
    }

    // Update date/time fields only — title field is the input, don't overwrite it
    sheet.dataset.nlpTitle = data.title;
    sheet.dataset.nlpRaw = text;
    const start = new Date(data.start);
    const end = new Date(nlpEventEnd(data, state.config.defaultEventDuration));
    const tz = state.config.timezone;
    if (data.allDay) {
      dateFields.setAllDay(data.start.slice(0, 10), allDayLastDay(data.start, data.end));
    } else {
      dateFields.setTimed(start, end);
    }

    // Show feedback with the recognized text highlighted inline. An all-day
    // start is UTC midnight, so its date is read in UTC, not the configured zone.
    const dateStr = start.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: data.allDay ? 'UTC' : tz,
    });
    const timeStr = data.allDay
      ? 'All day'
      : `${toTimeInputValue(start, tz)} – ${toTimeInputValue(end, tz)}`;
    const rruleTag = data.rrule ? ' · Repeats' : '';
    fb.innerHTML = '';
    // If parsedText is available, show "recognized: <blue span>" before the summary
    if (data.parsedText) {
      const rawInput = text;
      const idx = rawInput.toLowerCase().indexOf(data.parsedText.toLowerCase());
      if (idx !== -1) {
        const before = document.createTextNode(rawInput.slice(0, idx));
        const match = document.createElement('mark');
        match.className = 'nlp-match';
        match.textContent = rawInput.slice(idx, idx + data.parsedText.length);
        const after = document.createTextNode(rawInput.slice(idx + data.parsedText.length));
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
