import { state, calendarById } from '../app/state.js';
import {
  buildTimeColumn, buildHourLines, buildEventBlock,
  buildCurrentTimeLine, updateCurrentTimeLine, getTotalHeight, timeToTop,
} from '../components/timeGrid.js';

let timerId = null;

/**
 * Render the day view into container.
 * @param {HTMLElement} container
 * @param {function(event): void} onEventClick
 */
export function renderDay(container, onEventClick) {
  if (timerId) { clearInterval(timerId); timerId = null; }

  const date = state.selectedDate;
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  const dayEvents = state.events.filter(ev => {
    if (state.hiddenCalendars.has(ev.calendarId)) return false;
    return !ev.allDay && new Date(ev.start) < dayEnd && new Date(ev.end) > dayStart;
  });

  const allDayEvents = state.events.filter(ev => {
    if (state.hiddenCalendars.has(ev.calendarId)) return false;
    return ev.allDay && new Date(ev.start) < dayEnd && new Date(ev.end) > dayStart;
  });

  container.innerHTML = '';

  // Navigation bar
  const nav = buildNavBar(date, onEventClick);
  container.appendChild(nav);

  // All-day strip
  if (allDayEvents.length > 0) {
    const strip = buildAllDayStrip(allDayEvents, onEventClick);
    container.appendChild(strip);
  }

  // Scrollable time grid
  const scroll = document.createElement('div');
  scroll.className = 'grid-scroll';

  const wrapper = document.createElement('div');
  wrapper.className = 'day-grid';
  wrapper.style.height = `${getTotalHeight()}px`;

  const timeCol = buildTimeColumn();
  const eventsCol = document.createElement('div');
  eventsCol.className = 'events-col';
  eventsCol.style.height = `${getTotalHeight()}px`;
  eventsCol.appendChild(buildHourLines());

  const timeLine = buildCurrentTimeLine();
  eventsCol.appendChild(timeLine);

  for (const ev of dayEvents) {
    const cal = calendarById(ev.calendarId);
    eventsCol.appendChild(buildEventBlock(ev, cal?.color || '#4a90d9', onEventClick));
  }

  wrapper.appendChild(timeCol);
  wrapper.appendChild(eventsCol);
  scroll.appendChild(wrapper);
  container.appendChild(scroll);

  // Scroll to current time (minus 2 hours for context)
  const isToday = dayStart.toDateString() === new Date().toDateString();
  if (isToday) {
    requestAnimationFrame(() => {
      const offset = Math.max(0, timeToTop(new Date()) - 128);
      scroll.scrollTop = offset;
    });
    timerId = setInterval(() => updateCurrentTimeLine(timeLine), 60000);
  }
}

function buildNavBar(date, onEventClick) {
  const nav = document.createElement('div');
  nav.className = 'view-nav';

  const prev = document.createElement('button');
  prev.className = 'nav-arrow';
  prev.textContent = '‹';
  prev.addEventListener('click', () => {
    state.selectedDate = new Date(date.getTime() - 86400000);
    renderDay(prev.closest('#view-container'), onEventClick);
  });

  const title = document.createElement('span');
  title.className = 'view-nav-title';
  const isToday = date.toDateString() === new Date().toDateString();
  title.textContent = isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const todayBtn = document.createElement('button');
  todayBtn.className = 'nav-today-btn';
  todayBtn.textContent = 'Today';
  todayBtn.hidden = isToday;
  todayBtn.addEventListener('click', () => {
    state.selectedDate = new Date();
    renderDay(prev.closest('#view-container'), onEventClick);
  });

  const next = document.createElement('button');
  next.className = 'nav-arrow';
  next.textContent = '›';
  next.addEventListener('click', () => {
    state.selectedDate = new Date(date.getTime() + 86400000);
    renderDay(next.closest('#view-container'), onEventClick);
  });

  nav.appendChild(prev);
  nav.appendChild(title);
  nav.appendChild(todayBtn);
  nav.appendChild(next);
  return nav;
}

function buildAllDayStrip(events, onEventClick) {
  const strip = document.createElement('div');
  strip.className = 'allday-strip';
  for (const ev of events) {
    const cal = calendarById(ev.calendarId);
    const chip = document.createElement('div');
    chip.className = 'allday-chip';
    chip.style.background = cal?.color || '#4a90d9';
    chip.textContent = ev.title;
    chip.addEventListener('click', () => onEventClick(ev));
    strip.appendChild(chip);
  }
  return strip;
}

export function destroyDay() {
  if (timerId) { clearInterval(timerId); timerId = null; }
}
