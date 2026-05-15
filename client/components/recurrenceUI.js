import { state } from '../app/state.js';
import { esc } from '../app/utils.js';
import { showDatePicker } from './datePicker.js';
import {
  ALL_DAY_CODES, DAY_LONG, JS_DOW_TO_CODE, WEEKDAYS_SET, ordinal,
  parseRrule, serializeConfig, humanReadable,
} from './rruleParser.js';
import { getOccurrences, buildMiniCal } from './recurrencePreview.js';

/**
 * Build the full recurrence editor UI.
 * @param {Date} startDate - event/task start date (used to derive presets)
 * @param {string|null} currentRrule - existing RRULE string or null
 * @param {function(string|null): void} onChange - called with new RRULE or null
 * @param {{ hideWeekdays?: boolean }} [opts]
 * @returns {HTMLElement}
 */
export function buildRecurrenceEditor(startDate, currentRrule, onChange, opts = {}) {
  const root = document.createElement('div');
  root.className = 'rec-editor';

  // ── State ───────────────────────────────────────────────────────────────────
  let cfg = parseRrule(currentRrule);
  const isComplex = !cfg && !!currentRrule;
  let rawMode = isComplex;
  let rawRrule = isComplex ? currentRrule : '';
  let rawTouched = false;

  function cfgToPreset(c) {
    if (!c) return 'none';
    if (c.freq === 'daily' && !c.byWeekdays && !c.byMonthDay && c.interval === 1) return 'daily';
    if (c.freq === 'weekly' && c.byWeekdays?.length === 5 && c.byWeekdays.every(d => WEEKDAYS_SET.has(d))) return 'weekdays';
    if (c.freq === 'weekly') return 'weekly';
    if (c.freq === 'monthly') return 'monthly';
    if (c.freq === 'yearly') return 'yearly';
    return 'custom';
  }
  let preset = rawMode ? 'none' : cfgToPreset(cfg);

  const dow = JS_DOW_TO_CODE[startDate.getDay()];
  const dom = startDate.getDate();
  const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth()+1, 0).getDate();
  const isLastWeek = dom + 7 > daysInMonth;
  const weekOrdinal = isLastWeek ? -1 : Math.ceil(dom / 7);
  let monthlyMode = (cfg?.bySetPos !== null && cfg?.bySetPos !== undefined) ? 'nth' : 'dom';
  let monthlyModeExplicit = false;

  let endMode = cfg?.until ? 'date' : (cfg?.count ? 'count' : 'never');
  let endDate = cfg?.until || null;
  let endCount = cfg?.count || 10;

  const defaultWeeklyDays = () => [dow];
  let weeklyDays = (cfg?.freq === 'weekly' && cfg.byWeekdays) ? [...cfg.byWeekdays] : defaultWeeklyDays();
  let weeklyInterval = (cfg?.freq === 'weekly' ? cfg.interval : null) || 1;

  let customInterval = cfg?.interval || 1;
  let customFreq = cfg?.freq || 'day';

  // ── Build current RRULE from state ─────────────────────────────────────────
  function buildRrule() {
    if (rawMode) return rawTouched ? (rawRrule || null) : (isComplex ? currentRrule : null);
    if (preset === 'none') return null;
    const c = { freq: 'daily', interval: 1 };
    if (preset === 'daily') { c.freq = 'daily'; c.interval = 1; }
    else if (preset === 'weekdays') { c.freq = 'weekly'; c.interval = 1; c.byWeekdays = ['MO','TU','WE','TH','FR']; }
    else if (preset === 'weekly') {
      c.freq = 'weekly';
      c.interval = weeklyInterval;
      c.byWeekdays = weeklyDays.length ? [...weeklyDays] : [dow];
    } else if (preset === 'monthly') {
      c.freq = 'monthly'; c.interval = 1;
      if (monthlyMode === 'nth') { c.bySetPos = weekOrdinal; c.byWeekdays = [dow]; }
      else { c.byMonthDay = dom; }
    } else if (preset === 'yearly') { c.freq = 'yearly'; c.interval = 1; }
    else if (preset === 'custom') {
      c.freq = customFreq === 'day' ? 'daily' : customFreq === 'week' ? 'weekly' : customFreq === 'month' ? 'monthly' : 'yearly';
      c.interval = customInterval;
    }
    if (endMode === 'date' && endDate) c.until = endDate;
    else if (endMode === 'count') c.count = endCount;
    cfg = c;
    return serializeConfig(c);
  }

  function notify() {
    onChange(buildRrule() || null);
    refreshPreview();
  }

  // ── Sections ────────────────────────────────────────────────────────────────
  const presetWrap = document.createElement('div');
  presetWrap.className = 'rec-row';
  const presetSel = document.createElement('select');
  presetSel.className = 'rec-preset-sel';

  const presetOptions = [
    ['none','None'], ['daily','Daily'],
    ...(!opts.hideWeekdays ? [['weekdays','Weekdays']] : []),
    ['weekly','Weekly'], ['monthly','Monthly'], ['yearly','Yearly'], ['custom','Custom…'],
  ];
  for (const [v, l] of presetOptions) {
    const o = document.createElement('option');
    o.value = v; o.textContent = l;
    if (v === preset) o.selected = true;
    presetSel.appendChild(o);
  }
  presetSel.addEventListener('change', () => {
    preset = presetSel.value; rawMode = false;
    if (preset === 'weekly' && !weeklyDays.length) weeklyDays = defaultWeeklyDays();
    notify(); renderSub();
  });
  presetWrap.appendChild(presetSel);
  root.appendChild(presetWrap);

  const subWrap  = document.createElement('div');
  const endWrap  = document.createElement('div');
  endWrap.className = 'rec-section';
  const previewWrap = document.createElement('div');
  previewWrap.className = 'rec-preview';
  const advWrap  = document.createElement('div');
  advWrap.className = 'rec-section';
  root.append(subWrap, endWrap, previewWrap, advWrap);

  // ── Sub-UI ──────────────────────────────────────────────────────────────────
  function renderSub() {
    subWrap.innerHTML = ''; endWrap.innerHTML = ''; advWrap.innerHTML = '';
    if (preset === 'none' && !rawMode) { previewWrap.innerHTML = ''; return; }
    if (preset === 'weekly')  renderWeekly();
    else if (preset === 'monthly') renderMonthly();
    else if (preset === 'custom')  renderCustom();
    if (preset !== 'none') { renderEndConditions(); renderAdvanced(); }
  }

  function renderWeekly() {
    const iRow = document.createElement('div');
    iRow.className = 'rec-row rec-interval-row';
    iRow.appendChild(document.createTextNode('Repeat every '));
    const iInput = document.createElement('input');
    iInput.type = 'number'; iInput.min = '1'; iInput.max = '99';
    iInput.className = 'rec-interval-input'; iInput.value = weeklyInterval;
    iInput.addEventListener('input', () => { weeklyInterval = Math.max(1, parseInt(iInput.value) || 1); notify(); });
    iRow.append(iInput, document.createTextNode(' week(s)'));
    subWrap.appendChild(iRow);

    const chipsRow = document.createElement('div');
    chipsRow.className = 'rec-chips-row';
    const dayOrder = state.config.weekStart !== 'sunday'
      ? ['MO','TU','WE','TH','FR','SA','SU']
      : ['SU','MO','TU','WE','TH','FR','SA'];
    const shortLabel = { MO:'Mo',TU:'Tu',WE:'We',TH:'Th',FR:'Fr',SA:'Sa',SU:'Su' };
    for (const code of dayOrder) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rec-chip' + (weeklyDays.includes(code) ? ' active' : '');
      btn.textContent = shortLabel[code];
      btn.addEventListener('click', () => {
        if (weeklyDays.includes(code)) {
          if (weeklyDays.length > 1) weeklyDays = weeklyDays.filter(d => d !== code);
        } else {
          weeklyDays = [...weeklyDays, code];
        }
        btn.classList.toggle('active', weeklyDays.includes(code));
        notify();
      });
      chipsRow.appendChild(btn);
    }
    subWrap.appendChild(chipsRow);
  }

  function renderMonthly() {
    const ordLabels = { 1:'First',2:'Second',3:'Third',4:'Fourth','-1':'Last' };
    const posLabel = ordLabels[String(weekOrdinal)] || ordinal(weekOrdinal);

    for (const [val, text] of [['dom', ` Day ${dom} of every month`], ['nth', ` ${posLabel} ${DAY_LONG[dow]} of every month`]]) {
      const row = document.createElement('label');
      row.className = 'rec-radio-row';
      const r = document.createElement('input');
      r.type = 'radio'; r.name = 'monthly-mode'; r.value = val;
      r.checked = monthlyMode === val;
      r.addEventListener('change', () => { monthlyMode = val; monthlyModeExplicit = true; notify(); });
      row.append(r, document.createTextNode(text));
      subWrap.appendChild(row);
    }
  }

  function renderCustom() {
    const row = document.createElement('div');
    row.className = 'rec-row rec-interval-row';
    row.appendChild(document.createTextNode('Repeat every '));
    const iInput = document.createElement('input');
    iInput.type = 'number'; iInput.min = '1'; iInput.max = '99';
    iInput.className = 'rec-interval-input'; iInput.value = customInterval;
    iInput.addEventListener('input', () => { customInterval = Math.max(1, parseInt(iInput.value) || 1); notify(); });
    const fSel = document.createElement('select');
    fSel.className = 'rec-freq-sel';
    for (const [v, l] of [['day','day(s)'],['week','week(s)'],['month','month(s)'],['year','year(s)']]) {
      const o = document.createElement('option');
      o.value = v; o.textContent = l;
      if (v === customFreq) o.selected = true;
      fSel.appendChild(o);
    }
    fSel.addEventListener('change', () => { customFreq = fSel.value; notify(); });
    row.append(iInput, document.createTextNode(' '), fSel);
    subWrap.appendChild(row);
  }

  function renderEndConditions() {
    const label = document.createElement('div');
    label.className = 'rec-label'; label.textContent = 'Ends';
    endWrap.appendChild(label);
    for (const [v, l] of [['never','Never'],['date','On date'],['count','After']]) {
      const rowEl = document.createElement('label');
      rowEl.className = 'rec-radio-row';
      const r = document.createElement('input');
      r.type = 'radio'; r.name = 'end-mode'; r.value = v; r.checked = endMode === v;
      r.addEventListener('change', () => { endMode = v; notify(); renderEndConditions(); });
      rowEl.append(r, document.createTextNode(' ' + l));
      if (v === 'date' && endMode === 'date') {
        const dBtn = document.createElement('button');
        dBtn.type = 'button'; dBtn.className = 'date-picker-btn rec-end-date-btn';
        dBtn.textContent = endDate
          ? endDate.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
          : 'Pick date';
        dBtn.addEventListener('click', () => {
          showDatePicker(endDate || new Date(), sel => { endDate = sel; notify(); renderEndConditions(); });
        });
        rowEl.append(document.createTextNode(' '), dBtn);
      }
      if (v === 'count' && endMode === 'count') {
        const cInput = document.createElement('input');
        cInput.type = 'number'; cInput.min = '1'; cInput.max = '999';
        cInput.className = 'rec-interval-input'; cInput.value = endCount;
        cInput.addEventListener('input', () => { endCount = Math.max(1, parseInt(cInput.value) || 1); notify(); });
        rowEl.append(document.createTextNode(' '), cInput, document.createTextNode(' occurrences'));
      }
      endWrap.appendChild(rowEl);
    }
  }

  function renderAdvanced() {
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'rec-advanced-toggle';
    const body = document.createElement('div');
    body.className = 'rec-advanced-body hidden';
    let open = rawMode;
    toggle.textContent = (open ? '▼' : '▶') + ' Advanced';
    toggle.addEventListener('click', () => {
      open = !open;
      toggle.textContent = (open ? '▼' : '▶') + ' Advanced';
      body.classList.toggle('hidden', !open);
    });
    const rawLabel = document.createElement('div');
    rawLabel.className = 'rec-label'; rawLabel.textContent = 'Custom RRULE';
    const rawInput = document.createElement('input');
    rawInput.type = 'text'; rawInput.className = 'rec-raw-input';
    rawInput.placeholder = 'e.g. FREQ=WEEKLY;BYDAY=MO,WE';
    rawInput.value = rawMode ? (currentRrule || '') : (buildRrule() || '');
    if (rawMode && isComplex) {
      const notice = document.createElement('div');
      notice.className = 'rec-complex-notice';
      notice.textContent = 'Complex recurrence rule — edit with care';
      body.appendChild(notice);
    }
    rawInput.addEventListener('input', () => {
      rawMode = true; rawRrule = rawInput.value.trim(); rawTouched = true;
      presetSel.value = 'none'; preset = 'none'; notify();
    });
    body.append(rawLabel, rawInput);
    body.classList.toggle('hidden', !open);
    advWrap.append(toggle, body);
  }

  // ── Preview ─────────────────────────────────────────────────────────────────
  function refreshPreview() {
    previewWrap.innerHTML = '';
    const rruleStr = buildRrule();
    if (!rruleStr) return;
    const summary = document.createElement('div');
    summary.className = 'rec-summary';
    summary.textContent = humanReadable(cfg) || rruleStr;
    previewWrap.appendChild(summary);
    getOccurrences(rruleStr, startDate).then(dates => {
      if (!dates.length) return;
      if (previewWrap.contains(summary)) previewWrap.appendChild(buildMiniCal(dates));
    });
  }

  // ── Start date change hook ──────────────────────────────────────────────────
  root.onStartDateChange = (newDate) => {
    if (!monthlyModeExplicit && preset === 'monthly') { notify(); renderSub(); }
    refreshPreview();
  };

  renderSub();
  refreshPreview();
  return root;
}

// Re-export parser utilities for consumers that need them directly
export { parseRrule, serializeConfig, humanReadable } from './rruleParser.js';
