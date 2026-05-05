import { state, calendarById } from '../app/state.js';
import { formatTime } from '../app/utils.js';

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
    const day = new Date(today.getTime() + i * DAY_MS);
    const dayEnd = new Date(day.getTime() + DAY_MS);
    const dayEvents = state.events.filter(ev => {
      return new Date(ev.start) < dayEnd && new Date(ev.end) > day;
    });

    const isToday = i === 0;
    const header = document.createElement('div');
    header.className = 'agenda-group';

    const dateEl = document.createElement('div');
    dateEl.className = 'agenda-date-header' + (isToday ? ' today' : '');
    dateEl.textContent = formatDayHeader(day, isToday);
    header.appendChild(dateEl);

    if (dayEvents.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agenda-empty';
      empty.textContent = 'No events';
      header.appendChild(empty);
    } else {
      for (const ev of dayEvents) {
        header.appendChild(buildEventCard(ev, onEventClick));
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
