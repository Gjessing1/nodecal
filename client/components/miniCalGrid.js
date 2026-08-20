import { state } from '../app/state.js';
import {
  DAY_NAMES_MONDAY,
  DAY_NAMES_SUNDAY,
  addMonths,
  nextFocusDate,
  sameDay,
  weekColumn,
} from './miniCalDates.js';

/** @type {Intl.DateTimeFormatOptions} */
const LABEL_OPTS = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };

/**
 * Render the month grid of the date picker into `panel` and keep it in sync as
 * the user moves around. Only the day holding the roving focus is tabbable, so
 * Tab leaves the grid instead of stepping through every day of the month.
 *
 * @param {HTMLElement} panel
 * @param {Date} selectedDate - highlighted, and where focus starts
 * @param {(picked: Date) => void} onPick
 * @returns {HTMLElement|null} the day button to focus when the panel opens
 */
export function mountMiniCalGrid(panel, selectedDate, onPick) {
  const startOnMonday = state.config.weekStart !== 'sunday';
  let view = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  let focusDate = new Date(selectedDate.getTime());
  /** @type {'day'|'prev'|'next'|null} */
  let pendingFocus = null;
  /** @type {HTMLButtonElement|null} */
  let focusBtn = null;

  /** @param {Date} next */
  function moveFocusTo(next) {
    focusDate = next;
    view = new Date(next.getFullYear(), next.getMonth(), 1);
    pendingFocus = 'day';
    build();
  }

  /**
   * @param {number} n
   * @param {'prev'|'next'} which - the arrow to hand focus back to
   */
  function shiftMonth(n, which) {
    const moved = addMonths(new Date(view.getFullYear(), view.getMonth(), focusDate.getDate()), n);
    focusDate = moved;
    view = new Date(moved.getFullYear(), moved.getMonth(), 1);
    pendingFocus = which;
    build();
  }

  /** @param {Event} e */
  function dayOf(e) {
    const btn = /** @type {HTMLElement} */ (e.currentTarget);
    return new Date(view.getFullYear(), view.getMonth(), Number(btn.dataset.day));
  }

  /** @param {KeyboardEvent} e */
  function onDayKeydown(e) {
    const next = nextFocusDate(e.key, dayOf(e), startOnMonday);
    if (!next) return;
    e.preventDefault();
    moveFocusTo(next);
  }

  /** @param {Event} e */
  function onDayClick(e) {
    onPick(dayOf(e));
  }

  function buildNav() {
    const nav = document.createElement('div');
    nav.className = 'mini-cal-nav';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.textContent = '‹';
    prev.setAttribute('aria-label', 'Previous month');
    prev.addEventListener('click', function goPrev() {
      shiftMonth(-1, 'prev');
    });

    const label = document.createElement('span');
    label.setAttribute('aria-live', 'polite');
    label.textContent = view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = '›';
    next.setAttribute('aria-label', 'Next month');
    next.addEventListener('click', function goNext() {
      shiftMonth(1, 'next');
    });

    nav.append(prev, label, next);
    return { nav, prev, next };
  }

  function buildWeekdayHeader() {
    const header = document.createElement('div');
    header.className = 'mini-cal-grid';
    // Every day button announces its full date, so the initials would only add
    // noise for a screen reader.
    header.setAttribute('aria-hidden', 'true');
    for (const name of startOnMonday ? DAY_NAMES_MONDAY : DAY_NAMES_SUNDAY) {
      const cell = document.createElement('div');
      cell.className = 'mini-cal-wday';
      cell.textContent = name;
      header.appendChild(cell);
    }
    return header;
  }

  function buildDayGrid() {
    const today = new Date();
    const grid = document.createElement('div');
    grid.className = 'mini-cal-grid';

    const offset = weekColumn(new Date(view.getFullYear(), view.getMonth(), 1), startOnMonday);
    for (let i = 0; i < offset; i++) {
      const empty = document.createElement('div');
      empty.className = 'mini-cal-cell';
      empty.setAttribute('aria-hidden', 'true');
      grid.appendChild(empty);
    }

    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(view.getFullYear(), view.getMonth(), d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mini-cal-cell';
      btn.textContent = String(d);
      btn.dataset.day = String(d);
      btn.setAttribute('aria-label', cellDate.toLocaleDateString('en-US', LABEL_OPTS));
      if (sameDay(cellDate, today)) {
        btn.classList.add('today');
        btn.setAttribute('aria-current', 'date');
      }
      if (sameDay(cellDate, selectedDate)) btn.classList.add('selected');
      if (sameDay(cellDate, focusDate)) {
        btn.tabIndex = 0;
        focusBtn = btn;
      } else {
        btn.tabIndex = -1;
      }
      btn.addEventListener('click', onDayClick);
      btn.addEventListener('keydown', onDayKeydown);
      grid.appendChild(btn);
    }
    return grid;
  }

  function build() {
    panel.innerHTML = '';
    focusBtn = null;
    const { nav, prev, next } = buildNav();
    panel.append(nav, buildWeekdayHeader(), buildDayGrid());

    if (pendingFocus === 'day' && focusBtn) focusBtn.focus({ preventScroll: true });
    else if (pendingFocus === 'prev') prev.focus({ preventScroll: true });
    else if (pendingFocus === 'next') next.focus({ preventScroll: true });
    pendingFocus = null;
  }

  build();
  return focusBtn;
}
