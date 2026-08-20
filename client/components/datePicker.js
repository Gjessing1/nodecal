import { createPickerOverlay } from './pickerOverlay.js';
import { mountMiniCalGrid } from './miniCalGrid.js';

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Show a custom mini-calendar overlay that respects state.config.weekStart.
 * Replaces the native <input type="date"> showPicker() on mobile so the
 * first day of week matches the app setting (iOS ignores the HTML lang attribute).
 *
 * @param {Date} currentDate - the currently selected date (highlighted)
 * @param {function(Date): void} onSelect - called with the chosen Date
 */
export function showDatePicker(currentDate, onSelect) {
  const picker = createPickerOverlay({ id: 'mini-cal-overlay', label: 'Choose a date' });

  /** @param {Date} picked */
  function pick(picked) {
    picker.close();
    onSelect(picked);
  }

  const initialFocus = mountMiniCalGrid(picker.panel, currentDate, pick);
  picker.mount(initialFocus || undefined);
}

/**
 * Show a month/year picker overlay.
 * @param {number} currentYear
 * @param {number} currentMonth - 0-based
 * @param {(year: number, month: number) => void} onSelect
 */
export function showMonthYearPicker(currentYear, currentMonth, onSelect) {
  const picker = createPickerOverlay({ id: 'month-year-picker-overlay', label: 'Choose a month' });
  let viewYear = currentYear;

  function buildNav() {
    const nav = document.createElement('div');
    nav.className = 'mini-cal-nav';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.textContent = '‹';
    prev.setAttribute('aria-label', 'Previous year');
    prev.addEventListener('click', function goPrev() {
      viewYear--;
      // build() replaces the arrows, so hand focus to the fresh one.
      build().prev.focus({ preventScroll: true });
    });

    const yearLabel = document.createElement('span');
    yearLabel.textContent = String(viewYear);
    yearLabel.style.fontWeight = '600';
    yearLabel.setAttribute('aria-live', 'polite');

    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = '›';
    next.setAttribute('aria-label', 'Next year');
    next.addEventListener('click', function goNext() {
      viewYear++;
      build().next.focus({ preventScroll: true });
    });

    nav.append(prev, yearLabel, next);
    return { nav, prev, next };
  }

  function buildMonthGrid() {
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:8px 4px';
    /** @type {HTMLButtonElement|null} */
    let currentBtn = null;

    for (let m = 0; m < 12; m++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = MONTH_NAMES[m];
      btn.className = 'mini-cal-cell';
      btn.style.cssText = 'padding:8px 4px;border-radius:6px;font-size:13px;text-align:center';
      btn.setAttribute('aria-label', `${MONTH_NAMES[m]} ${viewYear}`);
      if (m === currentMonth && viewYear === currentYear) {
        btn.classList.add('selected');
        btn.setAttribute('aria-current', 'date');
        currentBtn = btn;
      }
      btn.addEventListener('click', function pickMonth() {
        picker.close();
        onSelect(viewYear, m);
      });
      grid.appendChild(btn);
    }
    return { grid, currentBtn };
  }

  function build() {
    picker.panel.innerHTML = '';
    const { nav, prev, next } = buildNav();
    const { grid, currentBtn } = buildMonthGrid();
    picker.panel.append(nav, grid);
    return { prev, next, currentBtn };
  }

  const { currentBtn } = build();
  picker.mount(currentBtn || undefined);
}
