import { state, calendarById } from '../app/state.js';
import { formatTime, localDateStr, getISOWeek, weatherBadge } from '../app/utils.js';
import { initLongPressCreate } from '../components/dnd.js';

const DAY_MS = 86400000;

/**
 * Render the agenda view into the given container element.
 * @param {HTMLElement} container
 * @param {function(event): void} onEventClick
 * @param {function(task): void} [onTaskClick]
 * @param {function(task): void} [onTaskComplete]
 * @param {function(Date): void} [onLongPress] - long-press on a day opens new event for that date
 */
export function renderAgenda(container, onEventClick, onTaskClick, onTaskComplete, onLongPress) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const agendaDays = state.config.agendaDays ?? 90;
  const fragments = [];

  for (let i = 0; i < agendaDays; i++) {
    const raw = new Date(today.getTime() + i * DAY_MS);
    const day = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
    const dayEnd = new Date(day.getTime() + DAY_MS);
    const str = localDateStr(day);
    const dayEvents = state.events.filter(ev => {
      if (ev.allDay) return ev.start.slice(0, 10) <= str && ev.end.slice(0, 10) > str;
      return new Date(ev.start) < dayEnd && new Date(ev.end) > day;
    });
    const dayTasks = (state.config.showTasksOnAgenda ?? state.config.showTasksOnCalendar)
      ? state.tasks.filter(t => t.due === str && t.status !== 'COMPLETED')
      : [];

    const isToday = i === 0;
    const header = document.createElement('div');
    header.className = 'agenda-group';

    const dateEl = document.createElement('div');
    dateEl.className = 'agenda-date-header' + (isToday ? ' today' : '');
    dateEl.textContent = formatDayHeader(day, isToday);
    header.appendChild(dateEl);

    if (dayEvents.length > 0 || dayTasks.length > 0) {
      for (const ev of dayEvents) {
        header.appendChild(buildEventCard(ev, onEventClick));
      }
      for (const task of dayTasks) {
        header.appendChild(buildTaskCard(task, onTaskClick, onTaskComplete));
      }
    }

    if (onLongPress) {
      const capturedDay = new Date(day);
      initLongPressCreate(header, {
        skipSelector: '.event-card,.task-check',
        onLongPress() { onLongPress(capturedDay); },
      });
    }

    fragments.push(header);
  }

  container.replaceChildren(...fragments);
}

function buildEventCard(ev, onClick) {
  const cal = calendarById(ev.calendarId);
  const color = cal?.color || '#4a90d9';

  const card = document.createElement('div');
  card.className = 'event-card';
  card.dataset.id = ev.id;

  const dot = document.createElement('div');
  dot.className = 'event-dot';
  dot.style.background = color;

  const info = document.createElement('div');
  info.className = 'event-info';

  const title = document.createElement('div');
  title.className = 'event-title';
  title.textContent = ev.title;

  const time = document.createElement('div');
  time.className = 'event-time';
  time.textContent = ev.allDay ? 'All day' : formatTime(new Date(ev.start), state.config.timeFormat, state.config.timezone) + ' – ' + formatTime(new Date(ev.end), state.config.timeFormat, state.config.timezone);

  info.appendChild(title);
  info.appendChild(time);
  card.appendChild(dot);
  card.appendChild(info);
  card.addEventListener('click', () => onClick(ev));
  return card;
}

function buildTaskCard(task, onTaskClick, onTaskComplete) {
  const card = document.createElement('div');
  card.className = 'event-card task-agenda-card';

  const check = document.createElement('button');
  check.className = 'task-check' + (task.status === 'COMPLETED' ? ' checked' : '');
  check.setAttribute('aria-label', task.status === 'COMPLETED' ? 'Mark incomplete' : 'Complete task');
  if (onTaskComplete) {
    check.addEventListener('click', e => { e.stopPropagation(); onTaskComplete(task); });
  }

  const info = document.createElement('div');
  info.className = 'event-info';
  info.style.cursor = 'pointer';
  if (onTaskClick) info.addEventListener('click', () => onTaskClick(task));

  const title = document.createElement('div');
  title.className = 'event-title';
  title.textContent = task.title;

  info.appendChild(title);
  card.appendChild(check);
  card.appendChild(info);
  return card;
}

function formatDayHeader(date, isToday) {
  // Week number: only on Mondays (ISO weekday 1)
  const isMonday = date.getDay() === 1;
  const wn = ((state.config.showWeekNumbersAgenda ?? state.config.showWeekNumbers) && isMonday) ? ` · W${getISOWeek(date)}` : '';
  // Weather: only for today
  const wx = isToday ? weatherBadge(localDateStr(date), state.weather, state.config.weatherDays ?? 6) : '';
  const wxTag = wx ? ` · ${wx}` : '';
  const long = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (isToday) return 'Today — ' + long + wn + wxTag;
  const tomorrow = new Date(Date.now() + DAY_MS);
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow — ' + long + wn;
  return long + wn;
}
