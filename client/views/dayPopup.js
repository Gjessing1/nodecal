import { state, calendarById } from '../app/state.js';
import { localDateStr, weatherBadge } from '../app/utils.js';
import { taskSourceVisible } from '../app/taskUtils.js';

/**
 * Show the day popup overlay (used by both month and week views).
 * @param {Date} day
 * @param {string} dayStr - YYYY-MM-DD
 * @param {function} onEventClick
 * @param {function} onDayClick
 * @param {function} onTaskComplete
 * @param {function} onTaskClick
 * @param {function} onNewTask
 * @param {function} onNewEvent
 */
export function showDayPopup(day, dayStr, onEventClick, onDayClick, onTaskComplete, onTaskClick, onNewTask, onNewEvent) {
  document.getElementById('month-day-popup')?.remove();

  const tz = state.config.timezone;
  const dayStart = new Date(day);
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const dayEvs = state.events
    .filter(ev => {
      if (state.hiddenCalendars.has(ev.calendarId)) return false;
      if (ev.allDay) return ev.start.slice(0, 10) <= dayStr && ev.end.slice(0, 10) > dayStr;
      return new Date(ev.start) < dayEnd && new Date(ev.end) > dayStart;
    })
    .sort((a, b) => (a.allDay ? -1 : 1) - (b.allDay ? -1 : 1) || new Date(a.start) - new Date(b.start));

  const dayTasks = (state.config.showTasksOnMonth ?? state.config.showTasksOnCalendar)
    ? state.tasks.filter(t => t.due === dayStr && t.status !== 'COMPLETED' && taskSourceVisible(t, state.hiddenCalendars))
    : [];

  const overlay = document.createElement('div');
  overlay.id = 'month-day-popup';
  overlay.className = 'day-popup-overlay';
  overlay.addEventListener('click', () => overlay.remove());

  const panel = document.createElement('div');
  panel.className = 'day-popup-panel';
  panel.addEventListener('click', e => e.stopPropagation());

  const heading = document.createElement('div');
  heading.className = 'day-popup-heading';
  const headingLeft = document.createElement('div');
  headingLeft.className = 'day-popup-heading-left';
  headingLeft.textContent = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const wx = weatherBadge(dayStr, state.weather, state.config.weatherDaysMonth ?? state.config.weatherDays ?? 4);
  if (wx) {
    const wxSpan = document.createElement('span');
    wxSpan.className = 'day-popup-weather';
    wxSpan.textContent = wx;
    headingLeft.appendChild(wxSpan);
  }
  const closeBtn = document.createElement('button');
  closeBtn.className = 'day-popup-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => overlay.remove());
  heading.appendChild(headingLeft);
  heading.appendChild(closeBtn);
  panel.appendChild(heading);

  if (!dayEvs.length && !dayTasks.length) {
    const empty = document.createElement('p');
    empty.className = 'day-popup-empty';
    empty.textContent = 'Nothing scheduled';
    panel.appendChild(empty);
  }

  for (const ev of dayEvs) {
    const row = document.createElement('div');
    row.className = 'day-popup-event';
    const cal = calendarById(ev.calendarId);
    const dot = document.createElement('span');
    dot.className = 'day-popup-dot';
    dot.style.background = cal?.color || '#4a90d9';
    const info = document.createElement('div');
    info.className = 'day-popup-info';
    const title = document.createElement('div');
    title.className = 'day-popup-title';
    title.textContent = ev.title;
    info.appendChild(title);
    if (!ev.allDay) {
      const time = document.createElement('div');
      time.className = 'day-popup-time';
      time.textContent = new Date(ev.start).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', hour12: state.config.timeFormat === '12h', timeZone: tz,
      });
      info.appendChild(time);
    }
    row.append(dot, info);
    row.addEventListener('click', () => { overlay.remove(); onEventClick(ev); });
    panel.appendChild(row);
  }

  for (const task of dayTasks) {
    const row = document.createElement('div');
    row.className = 'day-popup-task';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'day-popup-task-check';
    checkbox.checked = task.status === 'COMPLETED';
    checkbox.addEventListener('click', e => {
      e.stopPropagation();
      if (onTaskComplete) onTaskComplete(task);
      overlay.remove();
    });
    const title = document.createElement('div');
    title.className = 'day-popup-title';
    title.textContent = task.title;
    row.append(checkbox, title);
    row.addEventListener('click', () => { overlay.remove(); if (onTaskClick) onTaskClick(task); });
    panel.appendChild(row);
  }

  const footer = document.createElement('div');
  footer.className = 'day-popup-footer';
  if (onNewEvent) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost day-popup-new-event';
    btn.textContent = '+ Event';
    btn.addEventListener('click', () => { overlay.remove(); onNewEvent(new Date(day)); });
    footer.appendChild(btn);
  }
  if (onNewTask) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost day-popup-new-task';
    btn.textContent = '+ Task';
    btn.addEventListener('click', () => { overlay.remove(); onNewTask(new Date(day)); });
    footer.appendChild(btn);
  }
  if (onDayClick) {
    const btn = document.createElement('button');
    btn.className = 'day-popup-view-day btn btn-ghost';
    btn.textContent = 'Day view →';
    btn.addEventListener('click', () => { overlay.remove(); onDayClick(new Date(day)); });
    footer.appendChild(btn);
  }
  if (footer.children.length) panel.appendChild(footer);

  overlay.appendChild(panel);
  document.getElementById('app')?.appendChild(overlay);
}
