import { state } from '../app/state.js';

/**
 * Show a custom mini-calendar overlay that respects state.config.weekStart.
 * Replaces the native <input type="date"> showPicker() on mobile so the
 * first day of week matches the app setting (iOS ignores the HTML lang attribute).
 *
 * @param {Date} currentDate - the currently selected date (highlighted)
 * @param {function(Date): void} onSelect - called with the chosen Date
 */
export function showDatePicker(currentDate, onSelect) {
  document.getElementById('mini-cal-overlay')?.remove();

  const startOnMonday = state.config.weekStart !== 'sunday';
  let viewYear  = currentDate.getFullYear();
  let viewMonth = currentDate.getMonth();

  const overlay = document.createElement('div');
  overlay.id = 'mini-cal-overlay';
  overlay.className = 'mini-cal-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const panel = document.createElement('div');
  panel.className = 'mini-cal-panel';
  panel.addEventListener('click', e => e.stopPropagation());

  function buildCalendar() {
    panel.innerHTML = '';
    const today = new Date();

    // ── Navigation ────────────────────────────────────────
    const nav = document.createElement('div');
    nav.className = 'mini-cal-nav';

    const prev = document.createElement('button');
    prev.textContent = '‹';
    prev.addEventListener('click', () => {
      if (--viewMonth < 0) { viewMonth = 11; viewYear--; }
      buildCalendar();
    });

    const label = document.createElement('span');
    label.textContent = new Date(viewYear, viewMonth, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const next = document.createElement('button');
    next.textContent = '›';
    next.addEventListener('click', () => {
      if (++viewMonth > 11) { viewMonth = 0; viewYear++; }
      buildCalendar();
    });

    nav.appendChild(prev); nav.appendChild(label); nav.appendChild(next);
    panel.appendChild(nav);

    // ── Weekday header ────────────────────────────────────
    const dayNames = startOnMonday
      ? ['Mo','Tu','We','Th','Fr','Sa','Su']
      : ['Su','Mo','Tu','We','Th','Fr','Sa'];
    const header = document.createElement('div');
    header.className = 'mini-cal-grid';
    for (const d of dayNames) {
      const h = document.createElement('div');
      h.className = 'mini-cal-wday';
      h.textContent = d;
      header.appendChild(h);
    }
    panel.appendChild(header);

    // ── Day grid ──────────────────────────────────────────
    const grid = document.createElement('div');
    grid.className = 'mini-cal-grid';

    const firstDow = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
    const offset   = startOnMonday ? (firstDow === 0 ? 6 : firstDow - 1) : firstDow;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < offset; i++) {
      const empty = document.createElement('div');
      empty.className = 'mini-cal-cell';
      grid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const btn = document.createElement('button');
      btn.textContent = d;
      btn.className = 'mini-cal-cell';
      const cell = new Date(viewYear, viewMonth, d);
      if (cell.toDateString() === today.toDateString()) btn.classList.add('today');
      if (cell.toDateString() === currentDate.toDateString()) btn.classList.add('selected');
      btn.addEventListener('click', () => { overlay.remove(); onSelect(new Date(viewYear, viewMonth, d)); });
      grid.appendChild(btn);
    }

    panel.appendChild(grid);
  }

  buildCalendar();
  overlay.appendChild(panel);
  document.getElementById('app')?.appendChild(overlay);
}

/**
 * Show a month/year picker overlay.
 * @param {number} currentYear
 * @param {number} currentMonth - 0-based
 * @param {function(year: number, month: number): void} onSelect
 */
export function showMonthYearPicker(currentYear, currentMonth, onSelect) {
  document.getElementById('month-year-picker-overlay')?.remove();

  let viewYear = currentYear;

  const overlay = document.createElement('div');
  overlay.id = 'month-year-picker-overlay';
  overlay.className = 'mini-cal-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  const panel = document.createElement('div');
  panel.className = 'mini-cal-panel';
  panel.addEventListener('click', e => e.stopPropagation());

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function build() {
    panel.innerHTML = '';

    const nav = document.createElement('div');
    nav.className = 'mini-cal-nav';

    const prev = document.createElement('button');
    prev.textContent = '‹';
    prev.addEventListener('click', () => { viewYear--; build(); });

    const yearLabel = document.createElement('span');
    yearLabel.textContent = viewYear;
    yearLabel.style.fontWeight = '600';

    const next = document.createElement('button');
    next.textContent = '›';
    next.addEventListener('click', () => { viewYear++; build(); });

    nav.appendChild(prev); nav.appendChild(yearLabel); nav.appendChild(next);
    panel.appendChild(nav);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:8px 4px';

    for (let m = 0; m < 12; m++) {
      const btn = document.createElement('button');
      btn.textContent = MONTH_NAMES[m];
      btn.className = 'mini-cal-cell';
      btn.style.cssText = 'padding:8px 4px;border-radius:6px;font-size:13px;text-align:center';
      if (m === currentMonth && viewYear === currentYear) btn.classList.add('selected');
      btn.addEventListener('click', () => { overlay.remove(); onSelect(viewYear, m); });
      grid.appendChild(btn);
    }

    panel.appendChild(grid);
  }

  build();
  overlay.appendChild(panel);
  document.getElementById('app')?.appendChild(overlay);
}
