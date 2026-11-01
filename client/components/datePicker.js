import { createPickerOverlay } from './pickerOverlay.js';
import { PICKER_ARROW_CLASSES, PICKER_NAV_CLASSES, mountMiniCalGrid } from './miniCalGrid.js';

const MONTH_CELL_CLASSES =
  'flex aspect-square items-center justify-center rounded-sm px-xs py-sm text-sm';

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
    nav.className = PICKER_NAV_CLASSES;

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = PICKER_ARROW_CLASSES;
    prev.textContent = '‹';
    prev.setAttribute('aria-label', 'Previous year');
    prev.addEventListener('click', function goPrev() {
      viewYear--;
      // build() replaces the arrows, so hand focus to the fresh one.
      build().prev.focus({ preventScroll: true });
    });

    const yearLabel = document.createElement('span');
    yearLabel.textContent = String(viewYear);
    yearLabel.setAttribute('aria-live', 'polite');

    const next = document.createElement('button');
    next.type = 'button';
    next.className = PICKER_ARROW_CLASSES;
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
    grid.className = 'grid grid-cols-3 gap-field-y px-xs py-sm';
    /** @type {HTMLButtonElement|null} */
    let currentBtn = null;

    for (let m = 0; m < 12; m++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = MONTH_NAMES[m];
      btn.setAttribute('aria-label', `${MONTH_NAMES[m]} ${viewYear}`);
      if (m === currentMonth && viewYear === currentYear) {
        btn.className = `${MONTH_CELL_CLASSES} bg-accent text-on-accent`;
        btn.setAttribute('aria-current', 'date');
        currentBtn = btn;
      } else {
        btn.className = `${MONTH_CELL_CLASSES} text-text hover:bg-surface`;
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
