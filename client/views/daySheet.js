import { state } from '../app/state.js';
import { weatherBadge } from '../app/utils.js';
import { dayEvents, dayTasks, buildEventRow, buildTaskRow } from './dayItems.js';

// The month view's day area: a panel docked under the grid rather than an
// overlay over it, so the grid stays visible and simply compresses. Tapping
// another day swaps the contents in place, which is the whole point — the old
// popup had to be dismissed before the next day could be read.

// month.js hands this over so back-nav and the close button can put the grid
// back without either module importing the other.
/** @type {(() => void) | null} */
let rerenderMonth = null;

/** @param {() => void} fn */
export function setDaySheetRerender(fn) {
  rerenderMonth = fn;
}

/**
 * Close the sheet and let the grid expand again.
 * @returns {boolean} true when there was something to close.
 */
export function closeDaySheet() {
  if (!state.selectedDay) return false;
  state.selectedDay = null;
  rerenderMonth?.();
  return true;
}

/**
 * Build the docked panel for the selected day.
 * @param {Date} day
 * @param {string} dayStr - YYYY-MM-DD, local
 * @param {any} cb - the month view's callback bag
 * @param {any[]} monthEvents - the grid's pre-filtered event pool
 */
export function buildDaySheet(day, dayStr, cb, monthEvents) {
  const sheet = document.createElement('div');
  sheet.className = 'day-sheet';
  sheet.appendChild(buildHandle());
  sheet.appendChild(buildHeading(day, dayStr));

  const list = document.createElement('div');
  list.className = 'day-sheet-list';
  const evs = dayEvents(day, dayStr, monthEvents);
  const tasks = dayTasks(dayStr);

  if (!evs.length && !tasks.length) {
    const empty = document.createElement('p');
    empty.className = 'day-popup-empty';
    empty.textContent = 'Nothing scheduled';
    list.appendChild(empty);
  }
  for (const ev of evs) {
    list.appendChild(buildEventRow(ev, (e) => cb.onEventClick(e)));
  }
  for (const task of tasks) {
    list.appendChild(buildTaskRow(task, cb.onTaskComplete, cb.onTaskClick));
  }
  sheet.appendChild(list);

  const footer = buildFooter(day, cb);
  if (footer) sheet.appendChild(footer);
  return sheet;
}

function buildHandle() {
  const wrap = document.createElement('div');
  wrap.className = 'day-sheet-handle-wrap';
  const bar = document.createElement('div');
  bar.className = 'modal-handle';
  wrap.appendChild(bar);
  wrap.addEventListener('click', () => closeDaySheet());
  return wrap;
}

function buildHeading(day, dayStr) {
  const heading = document.createElement('div');
  heading.className = 'day-popup-heading day-sheet-heading';

  const left = document.createElement('div');
  left.className = 'day-popup-heading-left';
  left.textContent = day.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const wx = weatherBadge(
    dayStr,
    state.weather,
    state.config.weatherDaysMonth ?? state.config.weatherDays ?? 4,
  );
  if (wx) {
    const wxSpan = document.createElement('span');
    wxSpan.className = 'day-popup-weather';
    wxSpan.textContent = wx;
    left.appendChild(wxSpan);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'day-popup-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close day');
  closeBtn.addEventListener('click', () => closeDaySheet());

  heading.append(left, closeBtn);
  return heading;
}

function buildFooter(day, cb) {
  const footer = document.createElement('div');
  footer.className = 'day-popup-footer';
  const buttons = [
    ['+ Event', 'day-popup-new-event', cb.onLongPress],
    ['+ Task', 'day-popup-new-task', cb.onNewTask],
    ['Day view →', 'day-popup-view-day', cb.onDayClick],
  ];
  for (const [label, cls, handler] of buttons) {
    if (!handler) continue;
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost ' + cls;
    btn.textContent = label;
    btn.addEventListener('click', () => handler(new Date(day)));
    footer.appendChild(btn);
  }
  return footer.children.length ? footer : null;
}
