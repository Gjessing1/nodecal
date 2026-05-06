import { state, calendarById } from '../app/state.js';
import { formatTime, localDateStr } from '../app/utils.js';

const DAY_MS = 86400000;
const AGENDA_DAYS = 90;

/**
 * Render the agenda view into the given container element.
 * @param {HTMLElement} container
 * @param {function(event): void} onEventClick
 */
export function renderAgenda(container, onEventClick) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fragments = [];

  for (let i = 0; i < AGENDA_DAYS; i++) {
    const raw = new Date(today.getTime() + i * DAY_MS);
    const day = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
    const dayEnd = new Date(day.getTime() + DAY_MS);
    const str = localDateStr(day);
    const dayEvents = state.events.filter(ev => {
      if (ev.allDay) return ev.start.slice(0, 10) <= str && ev.end.slice(0, 10) > str;
      return new Date(ev.start) < dayEnd && new Date(ev.end) > day;
    });
    const dayTasks = state.config.showTasksOnCalendar
      ? state.tasks.filter(t => t.due === str && t.status !== 'COMPLETED')
      : [];

    const isToday = i === 0;
    const header = document.createElement('div');
    header.className = 'agenda-group';

    const dateEl = document.createElement('div');
    dateEl.className = 'agenda-date-header' + (isToday ? ' today' : '');
    dateEl.textContent = formatDayHeader(day, isToday);
    header.appendChild(dateEl);

    if (dayEvents.length === 0 && dayTasks.length === 0) {
      const noEvSpan = document.createElement('span');
      noEvSpan.className = 'agenda-empty-inline';
      noEvSpan.textContent = ' — No events';
      dateEl.appendChild(noEvSpan);
    } else {
      for (const ev of dayEvents) {
        header.appendChild(buildEventCard(ev, onEventClick));
      }
      for (const task of dayTasks) {
        header.appendChild(buildTaskCard(task));
      }
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
  time.textContent = ev.allDay ? 'All day' : formatTime(new Date(ev.start), state.config.timeFormat) + ' – ' + formatTime(new Date(ev.end), state.config.timeFormat);

  info.appendChild(title);
  info.appendChild(time);
  card.appendChild(dot);
  card.appendChild(info);
  card.addEventListener('click', () => onClick(ev));
  return card;
}

function buildTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'event-card task-agenda-card';

  const dot = document.createElement('div');
  dot.className = 'event-dot task-dot';

  const info = document.createElement('div');
  info.className = 'event-info';

  const title = document.createElement('div');
  title.className = 'event-title';
  title.textContent = '✓ ' + task.title;

  const time = document.createElement('div');
  time.className = 'event-time';
  time.textContent = 'Task';

  info.appendChild(title);
  info.appendChild(time);
  card.appendChild(dot);
  card.appendChild(info);
  return card;
}

function formatDayHeader(date, isToday) {
  if (isToday) {
    return 'Today — ' + date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  const tomorrow = new Date(Date.now() + DAY_MS);
  if (date.toDateString() === tomorrow.toDateString()) {
    return 'Tomorrow — ' + date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
