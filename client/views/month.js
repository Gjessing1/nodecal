import { state } from '../app/state.js';
import { initDayDnd, initSwipe } from '../components/dnd.js';
import { getISOWeek, localDateStr } from '../app/utils.js';
import { buildDayCell } from './monthCell.js';
import { buildNavBar, buildWeekDayHeader, goToMonth } from './monthNav.js';
import { layoutWeekRow } from './monthRow.js';
import { todayStr } from '../app/dayWindow.js';

/**
 * The month grid.
 *
 * The callbacks arrive as one object rather than nine positional arguments
 * because every re-render inside this file — month nav, swipe — has to pass the
 * whole set through again, and the day popup takes the bag whole.
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
  const todayDateStr = todayStr(state.config.timezone);
  const rerender = () => renderMonth(container, cb);

  // The 42 displayed days, which run from the Monday before the 1st into the
  // following month. Computed once so the event pool and the cells agree on
  // which days are on screen.
  const gridStart = gridStartDate(year, month);

  container.innerHTML = '';
  container.appendChild(buildNavBar(year, month, rerender));
  container.appendChild(buildWeekDayHeader());

  const monthEvents = monthEventPool(gridStart);
  const grid = buildGrid(gridStart, month, todayDateStr, monthEvents, cb);
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
}

// Monday-anchored start of the first displayed week.
function gridStartDate(year, month) {
  const dow = new Date(year, month, 1).getDay(); // 0=Sun
  return new Date(year, month, 1 - (dow === 0 ? 6 : dow - 1));
}

// Everything visible that overlaps the 42 displayed days, filtered once for the
// whole grid rather than per cell.
function monthEventPool(gridStart) {
  const end = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 42);
  const firstStr = localDateStr(gridStart);
  const lastStr = localDateStr(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1));
  return state.events.filter((ev) => {
    if (state.hiddenCalendars.has(ev.calendarId)) return false;
    // All-day events are stored at UTC midnight, so they are windowed as date
    // strings; compared as Dates the browser offset drops the ones sitting on
    // the grid's first or last day. All-day ends are exclusive.
    if (ev.allDay) return ev.start.slice(0, 10) <= lastStr && ev.end.slice(0, 10) > firstStr;
    return new Date(ev.start) < end && new Date(ev.end) > gridStart;
  });
}

function buildGrid(gridStart, month, todayDateStr, monthEvents, cb) {
  const showWN = state.config.showWeekNumbersMonth ?? state.config.showWeekNumbers;
  const grid = document.createElement('div');
  grid.className = 'month-grid' + (showWN ? ' with-weeknum' : '');
  const maxRows = 2;

  for (let week = 0; week < 6; week++) {
    const days = weekDays(gridStart, week);
    if (showWN) {
      const wn = document.createElement('div');
      wn.className = 'month-weeknum-cell';
      wn.textContent = 'W' + getISOWeek(days[0]);
      grid.appendChild(wn);
    }
    // A whole week at a time, because a multi-day bar has to sit in the same
    // chip row in every cell it crosses and no single cell can know that.
    const layouts = layoutWeekRow(days.map(localDateStr), monthEvents, maxRows);
    for (let i = 0; i < days.length; i++) {
      grid.appendChild(buildDayCell(days[i], month, todayDateStr, layouts[i], cb));
    }
  }
  return grid;
}

// The seven days of one grid row. Built from calendar fields, not millisecond
// arithmetic: adding 86400000ms across a DST fall-back lands on 23:00 of the
// same day and re-anchors to a duplicate date. The Date constructor rolls the
// day field over correctly.
function weekDays(gridStart, week) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const offset = week * 7 + i;
    days.push(
      new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + offset),
    );
  }
  return days;
}
