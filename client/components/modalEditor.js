import { state } from '../app/state.js';
import { toDateInputValue, toTimeInputValue, localToUTC } from '../app/utils.js';

const WHEEL_ITEM_H = 40;

/**
 * Wraps buildTimeWheel with a tap-to-reveal button.
 * Shows a text display of the time; tapping it opens the scroll wheel.
 */
function buildTimeButton(id, date, timezone = 'UTC', onTimeChange) {
  const wrap = document.createElement('div');
  wrap.className = 'time-btn-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'time-display-btn';

  const wheelPanel = document.createElement('div');
  wheelPanel.className = 'time-wheel-panel hidden';

  const pair = buildTimeWheel(id, date, timezone, val => {
    btn.textContent = val;
    if (onTimeChange) onTimeChange(val);
  });
  const hidden = pair.querySelector(`#${id}`);
  btn.textContent = hidden.value;
  wheelPanel.appendChild(pair);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = !wheelPanel.classList.contains('hidden');
    document.querySelectorAll('.time-wheel-panel').forEach(p => {
      if (p !== wheelPanel) {
        p.classList.add('hidden');
        p.previousElementSibling?.classList.remove('active');
      }
    });
    wheelPanel.classList.toggle('hidden', isOpen);
    btn.classList.toggle('active', !isOpen);
    if (!isOpen) {
      // Close on next outside click
      const closeOnOutside = ev => {
        if (!wheelPanel.contains(ev.target)) {
          wheelPanel.classList.add('hidden');
          btn.classList.remove('active');
          document.removeEventListener('click', closeOnOutside);
        }
      };
      setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(wheelPanel);
  return wrap;
}

function buildTimeWheel(id, date, timezone = 'UTC', onChange) {
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
    if (onChange) onChange(hidden.value);
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

const DAYS_SHORT = ['SU','MO','TU','WE','TH','FR','SA'];
const DAYS_LONG  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function ordinal(n) { return n + (n===1?'st':n===2?'nd':n===3?'rd':'th'); }

function repeatOptionsHtml(date, currentRrule) {
  const dow   = date.getDay();
  const dom   = date.getDate();
  const weeklyVal  = `FREQ=WEEKLY;BYDAY=${DAYS_SHORT[dow]}`;
  const monthlyVal = `FREQ=MONTHLY;BYMONTHDAY=${dom}`;

  // "Nth weekday of month" — e.g. "3rd Thursday" or "Last Thursday"
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const isLastWeek  = dom + 7 > daysInMonth;
  const weekOrdinal = isLastWeek ? -1 : Math.ceil(dom / 7);
  const nthDayVal   = `FREQ=MONTHLY;BYDAY=${weekOrdinal}${DAYS_SHORT[dow]}`;
  const ordLabels   = ['', 'First', 'Second', 'Third', 'Fourth'];
  const nthDayLabel = `Monthly (${weekOrdinal === -1 ? 'Last' : ordLabels[weekOrdinal]} ${DAYS_LONG[dow]})`;

  function matchPreset(r) {
    if (!r) return '';
    const norm = r.toUpperCase();
    if (/FREQ=DAILY/.test(norm) && !/INTERVAL=[2-9]|INTERVAL=\d{2}/.test(norm)) return 'FREQ=DAILY';
    if (/FREQ=WEEKLY/.test(norm) && !/INTERVAL=[2-9]|INTERVAL=\d{2}/.test(norm)) return weeklyVal;
    if (/FREQ=MONTHLY;BYDAY=/.test(norm) && !/INTERVAL=[2-9]|INTERVAL=\d{2}/.test(norm)) return nthDayVal;
    if (/FREQ=MONTHLY/.test(norm) && !/INTERVAL=[2-9]|INTERVAL=\d{2}/.test(norm)) return monthlyVal;
    if (/FREQ=YEARLY/.test(norm)) return 'FREQ=YEARLY';
    return '__custom__';
  }

  const sel = matchPreset(currentRrule);
  const opts = [
    ['', 'None'],
    ['FREQ=DAILY', 'Daily'],
    [weeklyVal, `Weekly on ${DAYS_LONG[dow]}`],
    [monthlyVal, `Monthly on ${ordinal(dom)}`],
    [nthDayVal, nthDayLabel],
    ['FREQ=YEARLY', 'Yearly'],
  ];
  if (sel === '__custom__') opts.push(['__custom__', `Custom (${currentRrule.split(';')[0]})`]);
  return opts.map(([v, l]) => `<option value="${esc(v)}"${sel===v?' selected':''}>${esc(l)}</option>`).join('');
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
    <div class="modal-field">
      <label>Title</label>
      <input type="text" id="f-title" value="${esc(event?.title || '')}" placeholder="${isNew ? 'e.g. Meeting tomorrow 14:00' : 'Event title'}" autocomplete="off">
      ${isNew ? '<div class="nlp-feedback hidden" id="nlp-fb"></div>' : ''}
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
    <div class="modal-field">
      <label>Repeat</label>
      <select id="f-repeat">
        ${repeatOptionsHtml(start, event?.rrule || null)}
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
    <div class="modal-row">
      <div class="modal-field">
        <label>Location</label>
        <input type="text" id="f-location" value="${esc(event?.location || '')}" placeholder="Location (optional)" autocomplete="off">
      </div>
      <div class="modal-field">
        <label>URL</label>
        <input type="url" id="f-url" value="${esc(event?.url || '')}" placeholder="https://…">
      </div>
    </div>
    <div class="modal-field">
      <label>Description</label>
      <textarea id="f-desc" rows="5">${esc(event?.description || '')}</textarea>
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

  // Helper: shift end time by same delta when start changes
  function shiftEnd(prevStartVal, newStartVal) {
    const [ph, pm] = prevStartVal.split(':').map(Number);
    const [nh, nm] = newStartVal.split(':').map(Number);
    const deltaMin = (nh * 60 + nm) - (ph * 60 + pm);
    const endEl = sheet.querySelector('#f-end-time');
    if (!endEl) return;
    const [eh, em] = endEl.value.split(':').map(Number);
    const newEndMin = Math.max(0, Math.min(1439, (eh * 60 + em) + deltaMin));
    const newEndVal = `${String(Math.floor(newEndMin / 60)).padStart(2,'0')}:${String(newEndMin % 60).padStart(2,'0')}`;
    endEl.value = newEndVal;
    // Update button text if 24h wheel
    const endBtn = sheet.querySelector('#f-end-time-wrap .time-display-btn');
    if (endBtn) endBtn.textContent = newEndVal;
  }

  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  if (is24h && isTouchDevice) {
    // Mobile 24h: scroll-wheel picker
    let prevStartVal = toTimeInputValue(start, tz);
    startWrap.appendChild(buildTimeButton('f-start-time', start, tz, newVal => {
      shiftEnd(prevStartVal, newVal);
      prevStartVal = newVal;
    }));
    endWrap.appendChild(buildTimeButton('f-end-time', end, tz));
  } else {
    // Desktop or 12h: native time input
    startWrap.innerHTML = `<input type="time" id="f-start-time" value="${toTimeInputValue(start, tz)}" style="width:100%">`;
    endWrap.innerHTML = `<input type="time" id="f-end-time" value="${toTimeInputValue(end, tz)}" style="width:100%">`;
    const startEl = sheet.querySelector('#f-start-time');
    let prevStartVal = startEl.value;
    startEl.addEventListener('change', () => {
      shiftEnd(prevStartVal, startEl.value);
      prevStartVal = startEl.value;
    });
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

  // URL open link — appears beside the input when a URL is set
  const urlInput = sheet.querySelector('#f-url');
  if (urlInput) {
    function updateUrlLink() {
      const existing = sheet.querySelector('.url-open-link');
      if (existing) existing.remove();
      if (urlInput.value.trim()) {
        const link = document.createElement('a');
        link.href = urlInput.value.trim();
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '↗ Open';
        link.className = 'url-open-link btn btn-ghost';
        urlInput.parentElement.appendChild(link);
      }
    }
    updateUrlLink();
    urlInput.addEventListener('input', updateUrlLink);
  }

  // When start date changes: shift end date by the same delta; refresh repeat options
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

      // Refresh repeat options so Weekly/Monthly labels reflect the new day/date
      const repeatSel = sheet.querySelector('#f-repeat');
      if (repeatSel) {
        const prevRepeat = repeatSel.value;
        repeatSel.innerHTML = repeatOptionsHtml(next, prevRepeat === '__custom__' ? (event?.rrule || null) : prevRepeat || null);
      }
    });
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
  const rawTitle = sheet.querySelector('#f-title').value.trim();
  if (!rawTitle) { sheet.querySelector('#f-title').focus(); return; }
  // If the user hasn't changed the input since NLP parsed it, use the stripped title
  const title = (sheet.dataset.nlpRaw && rawTitle === sheet.dataset.nlpRaw && sheet.dataset.nlpTitle)
    ? sheet.dataset.nlpTitle
    : rawTitle;

  const allDay = sheet.querySelector('#f-allday').checked;
  const calendarId = sheet.querySelector('#f-calendar').value;
  const description = sheet.querySelector('#f-desc').value.trim();
  const location = sheet.querySelector('#f-location')?.value.trim() || '';
  const url      = sheet.querySelector('#f-url')?.value.trim() || '';

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

  // Determine rrule: UI repeat select takes precedence over NLP detection
  const repeatVal = sheet.querySelector('#f-repeat')?.value;
  const nlpRrule  = !event ? (sheet.dataset.nlpRrule || null) : null;
  const rrule = (repeatVal && repeatVal !== '__custom__') ? repeatVal : nlpRrule;

  const data = { title, start: startDt.toISOString(), end: endDt.toISOString(), allDay, calendarId, description, location, url,
    rrule: rrule || null };
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
    if (!data.parsed) { fb.classList.add('hidden'); sheet.dataset.nlpRaw = ''; return; }

    // Update date/time fields only — title field is the input, don't overwrite it
    sheet.dataset.nlpTitle = data.title;
    sheet.dataset.nlpRaw   = text;
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
      // Refresh tap-to-reveal time buttons if present
      const startBtn = sheet.querySelector('#f-start-time-wrap .time-display-btn');
      const endBtn   = sheet.querySelector('#f-end-time-wrap .time-display-btn');
      if (startBtn) startBtn.textContent = startTimeVal;
      if (endBtn)   endBtn.textContent   = endTimeVal;
      sheet.querySelector('#f-allday').checked = false;
      sheet.querySelector('#allday-date-row').style.display = 'none';
      sheet.querySelector('#time-row').style.display = '';
    } else {
      sheet.querySelector('#f-date').value = toDateInputValue(start);
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

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
