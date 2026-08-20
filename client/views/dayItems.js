import { state, calendarById } from '../app/state.js';
import { taskSourceVisible } from '../app/taskUtils.js';
import { modifiedTag } from './occurrenceMark.js';

// What a single day holds, and how one line of it is drawn. Shared by the month
// grid cells, the week/desktop day popup and the mobile day sheet — the three
// used to filter and sort events three slightly different ways.

/**
 * Events touching `day`, all-day first, then by start time.
 * @param {Date} day
 * @param {string} dayStr - YYYY-MM-DD, local
 * @param {any[]} [events] - pre-filtered pool; defaults to everything visible
 */
export function dayEvents(day, dayStr, events) {
  const pool = events || state.events.filter((ev) => !state.hiddenCalendars.has(ev.calendarId));
  const dayStart = new Date(day);
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return pool
    .filter((ev) => {
      if (state.hiddenCalendars.has(ev.calendarId)) return false;
      // All-day events are stored at UTC midnight — compare them as date
      // strings, never as Dates, or the browser offset shifts them a day.
      if (ev.allDay) return ev.start.slice(0, 10) <= dayStr && ev.end.slice(0, 10) > dayStr;
      return new Date(ev.start) < dayEnd && new Date(ev.end) > dayStart;
    })
    .sort(
      (a, b) =>
        (a.allDay ? -1 : 1) - (b.allDay ? -1 : 1) ||
        new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
}

/**
 * Open tasks due on `dayStr`, or none when tasks are hidden on the calendar.
 * @param {string} dayStr - YYYY-MM-DD, local
 */
export function dayTasks(dayStr) {
  if (!(state.config.showTasksOnMonth ?? state.config.showTasksOnCalendar)) return [];
  return state.tasks.filter(
    (t) =>
      t.due === dayStr && t.status !== 'COMPLETED' && taskSourceVisible(t, state.hiddenCalendars),
  );
}

/**
 * One event line: calendar dot, title, start time.
 * @param {any} ev
 * @param {(ev: any) => void} onClick
 */
export function buildEventRow(ev, onClick) {
  const row = document.createElement('div');
  row.className = 'day-popup-event';

  const dot = document.createElement('span');
  dot.className = 'day-popup-dot';
  dot.style.background = calendarById(ev.calendarId)?.color || '#4a90d9';

  const info = document.createElement('div');
  info.className = 'day-popup-info';
  const title = document.createElement('div');
  title.className = 'day-popup-title';
  title.textContent = ev.title;
  info.appendChild(title);
  const meta = document.createElement('div');
  meta.className = 'day-popup-time';
  if (!ev.allDay) {
    meta.textContent = new Date(ev.start).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: state.config.timeFormat === '12h',
      timeZone: state.config.timezone,
    });
  }
  const edited = modifiedTag(ev);
  if (edited) {
    if (meta.textContent) meta.append(' · ');
    meta.appendChild(edited);
  }
  if (meta.textContent || edited) info.appendChild(meta);

  row.append(dot, info);
  row.addEventListener('click', () => onClick(ev));
  return row;
}

/**
 * One task line: checkbox and title. A null onComplete means offline.
 * @param {any} task
 * @param {((task: any) => void) | null | undefined} onComplete
 * @param {((task: any) => void) | null | undefined} onClick
 */
export function buildTaskRow(task, onComplete, onClick) {
  const row = document.createElement('div');
  row.className = 'day-popup-task';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'day-popup-task-check';
  checkbox.checked = task.status === 'COMPLETED';
  checkbox.disabled = !onComplete;
  if (!onComplete) checkbox.title = 'Unavailable offline';
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    if (onComplete) onComplete(task);
  });

  const title = document.createElement('div');
  title.className = 'day-popup-title';
  title.textContent = task.title;

  row.append(checkbox, title);
  row.addEventListener('click', () => onClick?.(task));
  return row;
}
