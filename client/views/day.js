import { state, calendarById } from '../app/state.js';
import { localDateStr } from '../app/utils.js';
import {
  buildTimeColumn, buildHourLines, buildEventBlock,
  buildCurrentTimeLine, updateCurrentTimeLine, getTotalHeight, timeToTop,
} from '../components/timeGrid.js';
import { initDnd, initSwipe } from '../components/dnd.js';

let timerId = null;
let _container = null;

/**
 * Render the day view into container.
 * @param {HTMLElement} container
 * @param {object} callbacks - { onEventClick, onEventMove, onEventResize }
 */
export function renderDay(container, callbacks) {
  _container = container;
  container.classList.add('internal-scroll');
  const { onEventClick, onEventMove, onEventResize, onTaskClick } = callbacks;
  if (timerId) { clearInterval(timerId); timerId = null; }

  const date = state.selectedDate;
  const isToday = date.toDateString() === new Date().toDateString();
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  const dayEvents = state.events.filter(ev => {
    if (state.hiddenCalendars.has(ev.calendarId)) return false;
    return !ev.allDay && new Date(ev.start) < dayEnd && new Date(ev.end) > dayStart;
  });

  const dayStr = localDateStr(dayStart);
  const allDayEvents = state.events.filter(ev => {
    if (state.hiddenCalendars.has(ev.calendarId)) return false;
    if (!ev.allDay) return false;
    return ev.start.slice(0, 10) <= dayStr && ev.end.slice(0, 10) > dayStr;
  });

  const dayTasks = state.config.showTasksOnCalendar
    ? state.tasks.filter(t => t.due === dayStr && t.status !== 'COMPLETED')
    : [];

  container.innerHTML = '';

  // Navigation bar
  const nav = buildNavBar(date, isToday, callbacks);
  container.appendChild(nav);

  // All-day strip (events + tasks)
  if (allDayEvents.length > 0 || dayTasks.length > 0) {
    const strip = buildAllDayStrip(allDayEvents, dayTasks, onEventClick, onTaskClick);
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

  const tz = state.config.timezone;
  const timeLine = buildCurrentTimeLine(tz);
  eventsCol.appendChild(timeLine);

  for (const ev of dayEvents) {
    const cal = calendarById(ev.calendarId);
    eventsCol.appendChild(buildEventBlock(ev, cal?.color || '#4a90d9', onEventClick, tz));
  }

  wrapper.appendChild(timeCol);
  wrapper.appendChild(eventsCol);
  scroll.appendChild(wrapper);
  container.appendChild(scroll);

  // Drag-and-drop
  initDnd(wrapper, scroll, {
    getDayFromX: () => dayStart,
    onMove: onEventMove,
    onResize: onEventResize,
  });

  // Swipe navigation
  initSwipe(scroll,
    () => { state.selectedDate = new Date(dayStart.getTime() - 86400000); renderDay(container, callbacks); },
    () => { state.selectedDate = new Date(dayStart.getTime() + 86400000); renderDay(container, callbacks); },
  );

  // Always scroll to a useful time: current time for today, 8 AM for other days
  requestAnimationFrame(() => {
    const scrollTarget = isToday ? new Date() : new Date(dayStart.getTime() + 8 * 3600000);
    scroll.scrollTop = Math.max(0, timeToTop(scrollTarget, tz) - 128);
  });
  if (isToday) {
    timerId = setInterval(() => updateCurrentTimeLine(timeLine, tz), 60000);
  }
}

function buildNavBar(date, isToday, callbacks) {
  const nav = document.createElement('div');
  nav.className = 'view-nav';

  const prev = document.createElement('button');
  prev.className = 'nav-arrow';
  prev.textContent = '‹';
  prev.addEventListener('click', () => {
    state.selectedDate = new Date(date.getTime() - 86400000);
    renderDay(prev.closest('#view-container'), callbacks);
  });

  const fmt = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const title = document.createElement('span');
  title.className = 'view-nav-title';
  title.textContent = isToday ? 'Today · ' + fmt(date) : fmt(date);

  const todayBtn = document.createElement('button');
  todayBtn.className = 'nav-today-btn';
  todayBtn.textContent = 'Today';
  todayBtn.hidden = isToday;
  todayBtn.addEventListener('click', () => {
    state.selectedDate = new Date();
    renderDay(prev.closest('#view-container'), callbacks);
  });

  const next = document.createElement('button');
  next.className = 'nav-arrow';
  next.textContent = '›';
  next.addEventListener('click', () => {
    state.selectedDate = new Date(date.getTime() + 86400000);
    renderDay(next.closest('#view-container'), callbacks);
  });

  nav.appendChild(prev);
  nav.appendChild(title);
  nav.appendChild(todayBtn);
  nav.appendChild(next);
  return nav;
}

function buildAllDayStrip(events, tasks, onEventClick, onTaskClick) {
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
  for (const task of tasks) {
    const chip = document.createElement('div');
    chip.className = 'allday-chip task-allday-chip';
    chip.style.cursor = 'pointer';
    chip.textContent = '✓ ' + task.title;
    if (onTaskClick) chip.addEventListener('click', () => onTaskClick(task));
    strip.appendChild(chip);
  }
  return strip;
}

export function destroyDay() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  if (_container) { _container.classList.remove('internal-scroll'); _container = null; }
}
