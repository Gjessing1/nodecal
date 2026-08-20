import { state } from '../app/state.js';
import { initDayDnd, initSwipe } from '../components/dnd.js';
import { getISOWeek } from '../app/utils.js';
import { showMonthYearPicker } from '../components/datePicker.js';
import { buildDaySheet, setDaySheetRerender } from './daySheet.js';
import { buildDayCell } from './monthCell.js';

/**
 * The month grid, plus the day sheet docked under it when a day is selected.
 *
 * The callbacks arrive as one object rather than nine positional arguments
 * because every re-render inside this file — month nav, swipe, day selection —
 * has to pass the whole set through again.
 *
 * @typedef {object} MonthCallbacks
 * @property {(event: any) => void} onEventClick
 * @property {(d: Date) => void} onDayClick
 * @property {((id: string, day: Date, startMin: number) => void) | null} [onEventMove]
 * @property {((d: Date) => void) | null} [onLongPress] - new event on that day
 * @property {((task: any) => void) | null} [onTaskComplete]
 * @property {((task: any) => void) | null} [onTaskClick]
 * @property {((d: Date) => void) | null} [onNewTask]
 *
 * @param {HTMLElement} container
 * @param {MonthCallbacks} cb
 */
export function renderMonth(container, cb) {
  const anchor = state.selectedDate;
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const today = new Date();
  const rerender = () => renderMonth(container, cb);
  setDaySheetRerender(rerender);

  // The 42 displayed days, which run from the Monday before the 1st into the
  // following month. Computed once: the event pool, the cells and the day sheet
  // all have to agree on which days are on screen.
  const gridStart = gridStartDate(year, month);
  const selected = selectedDayDate(gridStart);

  container.innerHTML = '';
  container.appendChild(buildNavBar(year, month, rerender));
  container.appendChild(buildWeekDayHeader());

  const monthEvents = monthEventPool(gridStart);
  const grid = buildGrid(gridStart, month, today, monthEvents, cb, rerender, !!selected);
  container.appendChild(grid);

  if (cb.onEventMove) {
    initDayDnd(grid, {
      chipSelector: '.month-event-chip',
      daySelector: '.month-day',
      onMove: cb.onEventMove,
    });
  }

  initSwipe(
    grid,
    () => goToMonth(year, month - 1, rerender),
    () => goToMonth(year, month + 1, rerender),
  );

  if (selected) {
    container.appendChild(buildDaySheet(selected, state.selectedDay, cb, monthEvents));
  }
}

// Monday-anchored start of the first displayed week.
function gridStartDate(year, month) {
  const dow = new Date(year, month, 1).getDay(); // 0=Sun
  return new Date(year, month, 1 - (dow === 0 ? 6 : dow - 1));
}

// A selected day only gets a sheet while it is one of the 42 on screen — the
// grid's trailing days belong to the neighbouring months and are selectable
// too, but a day scrolled out of the window is not.
function selectedDayDate(gridStart) {
  if (!state.selectedDay) return null;
  const [y, m, d] = state.selectedDay.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const end = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42);
  if (day < gridStart || day >= end) return null;
  return day;
}

// Changing month drops the selection: its day is no longer in the grid.
function goToMonth(year, month, rerender) {
  state.selectedDate = new Date(year, month, 1);
  state.selectedDay = null;
  rerender();
}

function buildNavBar(year, month, rerender) {
  const nav = document.createElement('div');
  nav.className = 'view-nav';

  const prev = document.createElement('button');
  prev.className = 'nav-arrow';
  prev.textContent = '‹';
  prev.addEventListener('click', () => goToMonth(year, month - 1, rerender));

  const title = document.createElement('span');
  title.className = 'view-nav-title clickable-title';
  title.textContent = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  title.addEventListener('click', () => {
    showMonthYearPicker(year, month, (y, m) => goToMonth(y, m, rerender));
  });

  const now = new Date();
  const todayBtn = document.createElement('button');
  todayBtn.className = 'nav-today-btn';
  todayBtn.textContent = 'Today';
  todayBtn.hidden = now.getFullYear() === year && now.getMonth() === month;
  todayBtn.addEventListener('click', () => {
    state.selectedDate = new Date();
    state.selectedDay = null;
    rerender();
  });

  const next = document.createElement('button');
  next.className = 'nav-arrow';
  next.textContent = '›';
  next.addEventListener('click', () => goToMonth(year, month + 1, rerender));

  nav.append(prev, title, todayBtn, next);
  return nav;
}

function buildWeekDayHeader() {
  const showWN = state.config.showWeekNumbersMonth ?? state.config.showWeekNumbers;
  const row = document.createElement('div');
  row.className = 'month-weekday-row' + (showWN ? ' with-weeknum' : '');
  if (showWN) {
    const wn = document.createElement('div');
    wn.className = 'month-weekday-label month-weeknum-label';
    wn.textContent = 'W';
    row.appendChild(wn);
  }
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    const cell = document.createElement('div');
    cell.className = 'month-weekday-label';
    cell.textContent = d;
    row.appendChild(cell);
  }
  return row;
}

// Everything visible that overlaps the 42 displayed days, filtered once for the
// whole grid rather than per cell.
function monthEventPool(gridStart) {
  const end = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42);
  return state.events.filter((ev) => {
    if (state.hiddenCalendars.has(ev.calendarId)) return false;
    return new Date(ev.start) < end && new Date(ev.end) > gridStart;
  });
}

function buildGrid(gridStart, month, today, monthEvents, cb, rerender, compressed) {
  const showWN = state.config.showWeekNumbersMonth ?? state.config.showWeekNumbers;
  const grid = document.createElement('div');
  grid.className = 'month-grid' + (showWN ? ' with-weeknum' : '');

  for (let i = 0; i < 42; i++) {
    // Built from calendar fields, not millisecond arithmetic: adding 86400000ms
    // across a DST fall-back lands on 23:00 of the same day and re-anchors to a
    // duplicate date. The Date constructor rolls the day field over correctly.
    const day = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    if (showWN && i % 7 === 0) {
      const wn = document.createElement('div');
      wn.className = 'month-weeknum-cell';
      wn.textContent = 'W' + getISOWeek(day);
      grid.appendChild(wn);
    }
    grid.appendChild(buildDayCell(day, month, today, monthEvents, cb, rerender, compressed));
  }
  return grid;
}
