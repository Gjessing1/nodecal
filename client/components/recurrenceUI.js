import { esc } from '../app/utils.js';
import { state } from '../app/state.js';
import { showDatePicker } from './datePicker.js';

/**
 * @typedef {Object} RecurrenceConfig
 * @property {"daily"|"weekly"|"monthly"|"yearly"} freq
 * @property {number} interval
 * @property {string[]} [byWeekdays]  - "MO","TU","WE","TH","FR","SA","SU"
 * @property {number} [byMonthDay]    - 1-31
 * @property {number} [bySetPos]      - -1(last) or 1-4
 * @property {Date}   [until]
 * @property {number} [count]
 */

// Day codes in RRULE order; index matches JS getDay() via (getDay()+6)%7 → no, use by name
const ALL_DAY_CODES = ['MO','TU','WE','TH','FR','SA','SU'];
const DAY_LONG = { MO:'Monday',TU:'Tuesday',WE:'Wednesday',TH:'Thursday',FR:'Friday',SA:'Saturday',SU:'Sunday' };
// JS getDay() (0=Sun) → RRULE day code
const JS_DOW_TO_CODE = ['SU','MO','TU','WE','TH','FR','SA'];
const WEEKDAYS_SET = new Set(['MO','TU','WE','TH','FR']);

function ordinal(n) {
  const abs = Math.abs(n);
  const s = abs === 1 ? 'st' : abs === 2 ? 'nd' : abs === 3 ? 'rd' : 'th';
  return n === -1 ? 'last' : abs + s;
}

// ── RRULE ↔ RecurrenceConfig ──────────────────────────────────────────────────

/**
 * Parse an RRULE string into a RecurrenceConfig.
 * Returns null if the rule is too complex to represent in the structured UI.
 * @param {string|null} str
 * @returns {RecurrenceConfig|null}
 */
export function parseRrule(str) {
  if (!str) return null;
  const parts = {};
  for (const seg of str.split(';')) {
    const eq = seg.indexOf('=');
    if (eq !== -1) parts[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1);
  }

  const freq = parts.FREQ?.toLowerCase();
  if (!['daily','weekly','monthly','yearly'].includes(freq)) return null;

  // Reject unknown fields
  const known = new Set(['FREQ','INTERVAL','BYDAY','BYMONTHDAY','BYSETPOS','UNTIL','COUNT']);
  if (Object.keys(parts).some(k => !known.has(k))) return null;

  const interval = parseInt(parts.INTERVAL) || 1;

  let byWeekdays = null;
  let bySetPos = null;
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',');
    // Positional prefix check: "3MO", "-1FR" etc.
    const posMatch = days.length === 1 && days[0].match(/^(-?\d+)([A-Z]{2})$/);
    if (posMatch) {
      bySetPos = parseInt(posMatch[1]);
      byWeekdays = [posMatch[2]];
    } else if (days.every(d => ALL_DAY_CODES.includes(d))) {
      byWeekdays = days;
    } else {
      return null; // mixed/unknown format
    }
  }

  // BYSETPOS without BYDAY positional is also valid (alternate format)
  if (parts.BYSETPOS && bySetPos === null) {
    const bsArr = parts.BYSETPOS.split(',');
    if (bsArr.length === 1) bySetPos = parseInt(bsArr[0]);
    else return null; // multiple BYSETPOS → too complex
  }

  const byMonthDay = parts.BYMONTHDAY ? parseInt(parts.BYMONTHDAY) : null;

  let until = null;
  if (parts.UNTIL) {
    const u = parts.UNTIL.replace(/[TZ]/g,'');
    const y = u.slice(0,4), mo = u.slice(4,6), d = u.slice(6,8);
    until = new Date(`${y}-${mo}-${d}T00:00:00`);
  }
  const count = parts.COUNT ? parseInt(parts.COUNT) : null;

  return { freq, interval, byWeekdays, byMonthDay, bySetPos, until, count };
}

/**
 * Serialize a RecurrenceConfig into an RRULE string.
 * @param {RecurrenceConfig} cfg
 * @returns {string}
 */
export function serializeConfig(cfg) {
  const parts = [`FREQ=${cfg.freq.toUpperCase()}`];
  if (cfg.interval > 1) parts.push(`INTERVAL=${cfg.interval}`);
  if (cfg.byWeekdays?.length) {
    if (cfg.bySetPos !== null && cfg.bySetPos !== undefined) {
      parts.push(`BYDAY=${cfg.bySetPos}${cfg.byWeekdays[0]}`);
    } else {
      parts.push(`BYDAY=${cfg.byWeekdays.join(',')}`);
    }
  }
  if (cfg.byMonthDay) parts.push(`BYMONTHDAY=${cfg.byMonthDay}`);
  if (cfg.until) {
    const u = cfg.until;
    const y = u.getFullYear();
    const mo = String(u.getMonth()+1).padStart(2,'0');
    const d  = String(u.getDate()).padStart(2,'0');
    parts.push(`UNTIL=${y}${mo}${d}T000000Z`);
  }
  if (cfg.count) parts.push(`COUNT=${cfg.count}`);
  return parts.join(';');
}

// ── Human-readable summary ────────────────────────────────────────────────────

export function humanReadable(cfg) {
  if (!cfg) return '';
  const days = cfg.byWeekdays || [];
  let base = '';
  if (cfg.freq === 'daily') {
    base = cfg.interval === 1 ? 'Repeats daily' : `Repeats every ${cfg.interval} days`;
  } else if (cfg.freq === 'weekly') {
    if (days.length === 5 && days.every(d => WEEKDAYS_SET.has(d))) {
      base = 'Repeats every weekday (Mon–Fri)';
    } else {
      const n = cfg.interval === 1 ? 'every week' : `every ${cfg.interval} weeks`;
      const dayStr = days.map(d => DAY_LONG[d]).join(' and ');
      base = dayStr ? `Repeats ${n} on ${dayStr}` : `Repeats ${n}`;
    }
  } else if (cfg.freq === 'monthly') {
    if (cfg.bySetPos !== null && cfg.bySetPos !== undefined && days.length) {
      base = `Repeats every month on the ${ordinal(cfg.bySetPos)} ${DAY_LONG[days[0]]}`;
    } else if (cfg.byMonthDay) {
      base = `Repeats on the ${ordinal(cfg.byMonthDay)} of each month`;
    } else {
      base = 'Repeats monthly';
    }
  } else if (cfg.freq === 'yearly') {
    base = cfg.interval === 1 ? 'Repeats yearly' : `Repeats every ${cfg.interval} years`;
  }

  const suffix = cfg.count
    ? `Ends after ${cfg.count} occurrence${cfg.count === 1 ? '' : 's'}`
    : cfg.until
      ? `Ends on ${cfg.until.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}`
      : '';
  return suffix ? `${base} · ${suffix}` : base;
}

// ── Occurrence preview (uses rrule.js ESM) ────────────────────────────────────

async function loadRRule() {
  if (window._rruleModule) return window._rruleModule;
  try {
    const m = await import('/rrule/index.js');
    window._rruleModule = m;
    return m;
  } catch { return null; }
}

async function getOccurrences(rruleStr, startDate) {
  if (!rruleStr) return [];
  const mod = await loadRRule();
  if (!mod) return [];
  try {
    const { rrulestr } = mod;
    const y = startDate.getFullYear(), mo = String(startDate.getMonth()+1).padStart(2,'0');
    const d = String(startDate.getDate()).padStart(2,'0');
    const rule = rrulestr(`DTSTART;VALUE=DATE:${y}${mo}${d}\nRRULE:${rruleStr}`);
    const cutoff = new Date(startDate.getTime() + 24 * 30 * 86400000);
    return rule.between(startDate, cutoff, true).slice(0, 6);
  } catch { return []; }
}

// ── Mini-calendar preview ─────────────────────────────────────────────────────

function buildMiniCal(occurrences, refDate) {
  const wrap = document.createElement('div');
  wrap.className = 'rec-preview-cal';
  if (!occurrences.length) return wrap;

  const startOnMonday = state.config.weekStart !== 'sunday';
  const dayNames = startOnMonday
    ? ['Mo','Tu','We','Th','Fr','Sa','Su']
    : ['Su','Mo','Tu','We','Th','Fr','Sa'];

  // Collect all unique months that contain occurrences (max 3)
  const months = [];
  const seen = new Set();
  for (const d of occurrences) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!seen.has(key) && months.length < 3) { seen.add(key); months.push({ y: d.getFullYear(), m: d.getMonth() }); }
  }

  const occSet = new Set(occurrences.map(d =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  ));

  for (const { y, m } of months) {
    const header = document.createElement('div');
    header.className = 'rec-cal-header';
    header.textContent = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    wrap.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'rec-cal-grid';

    for (const name of dayNames) {
      const h = document.createElement('div');
      h.className = 'rec-cal-wday';
      h.textContent = name;
      grid.appendChild(h);
    }

    const firstDow = new Date(y, m, 1).getDay();
    const offset   = startOnMonday ? (firstDow === 0 ? 6 : firstDow - 1) : firstDow;
    const daysInM  = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < offset; i++) {
      const e = document.createElement('div');
      e.className = 'rec-cal-cell';
      grid.appendChild(e);
    }
    for (let day = 1; day <= daysInM; day++) {
      const key = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const cell = document.createElement('div');
      cell.className = 'rec-cal-cell' + (occSet.has(key) ? ' rec-cal-occ' : '');
      cell.textContent = day;
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
  }
  return wrap;
}

// ── Main editor ───────────────────────────────────────────────────────────────

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

  // Derive initial preset name from config
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

  // Monthly: track which mode the user has chosen (byMonthDay vs nth-weekday)
  const dow = JS_DOW_TO_CODE[startDate.getDay()];
  const dom = startDate.getDate();
  const daysInMonth = new Date(startDate.getFullYear(), startDate.getMonth()+1, 0).getDate();
  const isLastWeek = dom + 7 > daysInMonth;
  const weekOrdinal = isLastWeek ? -1 : Math.ceil(dom / 7);
  let monthlyMode = (cfg?.bySetPos !== null && cfg?.bySetPos !== undefined) ? 'nth' : 'dom';
  let monthlyModeExplicit = false; // has the user manually toggled?

  // End condition
  let endMode = cfg?.until ? 'date' : (cfg?.count ? 'count' : 'never');
  let endDate = cfg?.until || null;
  let endCount = cfg?.count || 10;

  // Weekly day selection
  const defaultWeeklyDays = () => [dow]; // start with current day pre-selected
  let weeklyDays = (cfg?.freq === 'weekly' && cfg.byWeekdays) ? [...cfg.byWeekdays] : defaultWeeklyDays();
  let weeklyInterval = (cfg?.freq === 'weekly' ? cfg.interval : null) || 1;

  // Custom interval
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
      c.freq = 'monthly';
      c.interval = 1;
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
    const r = buildRrule();
    onChange(r || null);
    refreshPreview();
  }

  // ── Sections ────────────────────────────────────────────────────────────────

  // Preset select
  const presetWrap = document.createElement('div');
  presetWrap.className = 'rec-row';
  const presetSel = document.createElement('select');
  presetSel.className = 'rec-preset-sel';

  const presetOptions = [
    ['none','None'],
    ['daily','Daily'],
    ...(!opts.hideWeekdays ? [['weekdays','Weekdays']] : []),
    ['weekly','Weekly'],
    ['monthly','Monthly'],
    ['yearly','Yearly'],
    ['custom','Custom…'],
  ];
  for (const [v, l] of presetOptions) {
    const o = document.createElement('option');
    o.value = v; o.textContent = l;
    if (v === preset) o.selected = true;
    presetSel.appendChild(o);
  }
  presetSel.addEventListener('change', () => {
    preset = presetSel.value;
    rawMode = false;
    // Initialize weekly days from startDate when switching to weekly
    if (preset === 'weekly' && !weeklyDays.length) weeklyDays = defaultWeeklyDays();
    notify();
    renderSub();
  });
  presetWrap.appendChild(presetSel);
  root.appendChild(presetWrap);

  // Sub-UI container (weekly chips, monthly radio, custom spinner)
  const subWrap = document.createElement('div');
  root.appendChild(subWrap);

  // End conditions
  const endWrap = document.createElement('div');
  endWrap.className = 'rec-section';
  root.appendChild(endWrap);

  // Preview (human-readable + mini-cal)
  const previewWrap = document.createElement('div');
  previewWrap.className = 'rec-preview';
  root.appendChild(previewWrap);

  // Advanced section
  const advWrap = document.createElement('div');
  advWrap.className = 'rec-section';
  root.appendChild(advWrap);

  // ── Sub-UI rendering ────────────────────────────────────────────────────────

  function renderSub() {
    subWrap.innerHTML = '';
    endWrap.innerHTML = '';
    advWrap.innerHTML = '';
    if (preset === 'none' && !rawMode) { previewWrap.innerHTML = ''; return; }

    if (preset === 'weekly') renderWeekly();
    else if (preset === 'monthly') renderMonthly();
    else if (preset === 'custom') renderCustom();

    if (preset !== 'none') {
      renderEndConditions();
      renderAdvanced();
    }
  }

  function renderWeekly() {
    // Interval row
    const iRow = document.createElement('div');
    iRow.className = 'rec-row rec-interval-row';
    iRow.innerHTML = 'Repeat every ';
    const iInput = document.createElement('input');
    iInput.type = 'number'; iInput.min = '1'; iInput.max = '99';
    iInput.className = 'rec-interval-input';
    iInput.value = weeklyInterval;
    iInput.addEventListener('input', () => {
      weeklyInterval = Math.max(1, parseInt(iInput.value) || 1);
      notify();
    });
    const iLabel = document.createElement('span');
    iLabel.textContent = ' week(s)';
    iRow.appendChild(iInput); iRow.appendChild(iLabel);
    subWrap.appendChild(iRow);

    // Day chips
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

    const r1Wrap = document.createElement('label');
    r1Wrap.className = 'rec-radio-row';
    const r1 = document.createElement('input');
    r1.type = 'radio'; r1.name = 'monthly-mode'; r1.value = 'dom';
    r1.checked = monthlyMode === 'dom';
    r1Wrap.appendChild(r1);
    r1Wrap.appendChild(document.createTextNode(` Day ${dom} of every month`));

    const r2Wrap = document.createElement('label');
    r2Wrap.className = 'rec-radio-row';
    const r2 = document.createElement('input');
    r2.type = 'radio'; r2.name = 'monthly-mode'; r2.value = 'nth';
    r2.checked = monthlyMode === 'nth';
    r2Wrap.appendChild(r2);
    r2Wrap.appendChild(document.createTextNode(` ${posLabel} ${DAY_LONG[dow]} of every month`));

    r1.addEventListener('change', () => { monthlyMode = 'dom'; monthlyModeExplicit = true; notify(); });
    r2.addEventListener('change', () => { monthlyMode = 'nth'; monthlyModeExplicit = true; notify(); });

    subWrap.appendChild(r1Wrap);
    subWrap.appendChild(r2Wrap);
  }

  function renderCustom() {
    const row = document.createElement('div');
    row.className = 'rec-row rec-interval-row';
    row.innerHTML = 'Repeat every ';
    const iInput = document.createElement('input');
    iInput.type = 'number'; iInput.min = '1'; iInput.max = '99';
    iInput.className = 'rec-interval-input';
    iInput.value = customInterval;
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
    row.appendChild(iInput); row.appendChild(document.createTextNode(' ')); row.appendChild(fSel);
    subWrap.appendChild(row);
  }

  function renderEndConditions() {
    const label = document.createElement('div');
    label.className = 'rec-label';
    label.textContent = 'Ends';
    endWrap.appendChild(label);

    for (const [v, l] of [['never','Never'],['date','On date'],['count','After']]) {
      const rowEl = document.createElement('label');
      rowEl.className = 'rec-radio-row';
      const r = document.createElement('input');
      r.type = 'radio'; r.name = 'end-mode'; r.value = v;
      r.checked = endMode === v;
      r.addEventListener('change', () => { endMode = v; notify(); renderEndConditions(); });
      rowEl.appendChild(r);
      rowEl.appendChild(document.createTextNode(' ' + l));

      if (v === 'date' && endMode === 'date') {
        const dBtn = document.createElement('button');
        dBtn.type = 'button';
        dBtn.className = 'date-picker-btn rec-end-date-btn';
        dBtn.textContent = endDate
          ? endDate.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
          : 'Pick date';
        dBtn.addEventListener('click', () => {
          showDatePicker(endDate || new Date(), sel => {
            endDate = sel;
            notify();
            renderEndConditions();
          });
        });
        rowEl.appendChild(document.createTextNode(' '));
        rowEl.appendChild(dBtn);
      }
      if (v === 'count' && endMode === 'count') {
        const cInput = document.createElement('input');
        cInput.type = 'number'; cInput.min = '1'; cInput.max = '999';
        cInput.className = 'rec-interval-input';
        cInput.value = endCount;
        cInput.addEventListener('input', () => { endCount = Math.max(1, parseInt(cInput.value) || 1); notify(); });
        rowEl.appendChild(document.createTextNode(' '));
        rowEl.appendChild(cInput);
        rowEl.appendChild(document.createTextNode(' occurrences'));
      }
      endWrap.appendChild(rowEl);
    }
  }

  function renderAdvanced() {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'rec-advanced-toggle';
    const body = document.createElement('div');
    body.className = 'rec-advanced-body hidden';
    let open = rawMode; // auto-open for complex rules
    toggle.textContent = (open ? '▼' : '▶') + ' Advanced';
    toggle.addEventListener('click', () => {
      open = !open;
      toggle.textContent = (open ? '▼' : '▶') + ' Advanced';
      body.classList.toggle('hidden', !open);
    });

    // Raw RRULE editor
    const rawLabel = document.createElement('div');
    rawLabel.className = 'rec-label';
    rawLabel.textContent = 'Custom RRULE';
    const rawInput = document.createElement('input');
    rawInput.type = 'text';
    rawInput.className = 'rec-raw-input';
    rawInput.placeholder = 'e.g. FREQ=WEEKLY;BYDAY=MO,WE';
    rawInput.value = rawMode ? (currentRrule || '') : (buildRrule() || '');
    if (rawMode && isComplex) {
      const notice = document.createElement('div');
      notice.className = 'rec-complex-notice';
      notice.textContent = 'Complex recurrence rule — edit with care';
      body.appendChild(notice);
    }
    rawInput.addEventListener('input', () => {
      rawMode = true;
      rawRrule = rawInput.value.trim();
      rawTouched = true;
      presetSel.value = 'none';
      preset = 'none';
      notify();
    });

    body.appendChild(rawLabel);
    body.appendChild(rawInput);
    body.classList.toggle('hidden', !open);
    advWrap.appendChild(toggle);
    advWrap.appendChild(body);
  }

  // ── Preview ─────────────────────────────────────────────────────────────────

  function refreshPreview() {
    previewWrap.innerHTML = '';
    const rruleStr = buildRrule();
    if (!rruleStr) return;

    // Human-readable line
    const summary = document.createElement('div');
    summary.className = 'rec-summary';
    summary.textContent = humanReadable(cfg) || rruleStr;
    previewWrap.appendChild(summary);

    // Async mini-calendar
    getOccurrences(rruleStr, startDate).then(dates => {
      if (!dates.length) return;
      const cal = buildMiniCal(dates, startDate);
      // Only append if the preview is still showing the same rule
      if (previewWrap.contains(summary)) previewWrap.appendChild(cal);
    });
  }

  // ── Start date change hook ───────────────────────────────────────────────────
  // Call this externally if the start date changes so monthly presets update
  root.onStartDateChange = (newDate) => {
    // Update monthly derivations if monthly mode was not explicitly set
    if (!monthlyModeExplicit && preset === 'monthly') {
      notify();
      renderSub();
    }
    refreshPreview();
  };

  // ── Initial render ──────────────────────────────────────────────────────────
  renderSub();
  refreshPreview();
  return root;
}

// Kept for backward compat — no longer renders HTML options
export function repeatOptionsHtml() { return ''; }
