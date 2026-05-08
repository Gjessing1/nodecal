import { state, calendarById } from '../app/state.js';
import { localDateStr } from '../app/utils.js';
import {
  buildTimeColumn, buildHourLines, buildEventBlock,
  buildCurrentTimeLine, updateCurrentTimeLine, getTotalHeight, timeToTop,
  TIME_COL_WIDTH,
} from '../components/timeGrid.js';
import { initDnd, initSwipe, initLongPressCreate } from '../components/dnd.js';
import { HOUR_HEIGHT } from '../components/timeGrid.js';

let timerId = null;
let _container = null;

/** Return the Monday of the week containing `date`. */
function weekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Render the week view into container.
 * @param {HTMLElement} container
 * @param {object} callbacks - { onEventClick, onEventMove, onEventResize }
 */
export function renderWeek(container, callbacks) {
  _container = container;
  container.classList.add('internal-scroll');
  const { onEventClick, onEventMove, onEventResize, onLongPress } = callbacks;
  if (timerId) { clearInterval(timerId); timerId = null; }

  const wStart = weekStart(state.selectedDate);
  const wEnd = new Date(wStart.getFullYear(), wStart.getMonth(), wStart.getDate() + 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(wStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = new Date();

  container.innerHTML = '';

  // Navigation bar
  container.appendChild(buildNavBar(wStart, callbacks));

  // All-day row
  const allDayEvents = state.events.filter(ev => {
    if (state.hiddenCalendars.has(ev.calendarId)) return false;
    return ev.allDay && new Date(ev.start) < wEnd && new Date(ev.end) > wStart;
  });
  if (allDayEvents.length > 0) container.appendChild(buildAllDayRow(days, allDayEvents, onEventClick));

  // Day-column headers
  container.appendChild(buildDayHeaders(days, today));

  // Scrollable time grid
  const scroll = document.createElement('div');
  scroll.className = 'grid-scroll';
  const grid = document.createElement('div');
  grid.className = 'week-grid';
  grid.style.height = `${getTotalHeight()}px`;

  grid.appendChild(buildTimeColumn());

  let timeLine = null;
  for (const day of days) {
    const col = document.createElement('div');
    col.className = 'week-day-col';
    col.style.height = `${getTotalHeight()}px`;
    col.appendChild(buildHourLines());

    const tz = state.config.timezone;
    const isToday = day.toDateString() === today.toDateString();
    if (isToday) {
      timeLine = buildCurrentTimeLine(tz);
      col.appendChild(timeLine);
    }

    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const dayEvents = state.events.filter(ev => {
      if (state.hiddenCalendars.has(ev.calendarId)) return false;
      return !ev.allDay && new Date(ev.start) < dayEnd && new Date(ev.end) > day;
    });

    for (const ev of dayEvents) {
      const cal = calendarById(ev.calendarId);
      col.appendChild(buildEventBlock(ev, cal?.color || '#4a90d9', onEventClick, tz));
    }

    grid.appendChild(col);
  }

  scroll.appendChild(grid);
  container.appendChild(scroll);

  // Drag-and-drop
  initDnd(grid, scroll, {
    getDayFromX(clientX, gridRect) {
      const x = clientX - gridRect.left - TIME_COL_WIDTH;
      const colW = (gridRect.width - TIME_COL_WIDTH) / 7;
      return days[Math.max(0, Math.min(6, Math.floor(x / colW)))];
    },
    onMove: onEventMove,
    onResize: onEventResize,
  });

  // Swipe navigation
  initSwipe(scroll,
    () => { state.selectedDate = new Date(wStart.getTime() - 7 * 86400000); renderWeek(container, callbacks); },
    () => { state.selectedDate = new Date(wStart.getTime() + 7 * 86400000); renderWeek(container, callbacks); },
  );

  // Long-press on empty time grid → create event at that day/time
  if (onLongPress) {
    initLongPressCreate(grid, {
      skipSelector: '.event-block',
      onLongPress(clientX, clientY) {
        const gridRect = grid.getBoundingClientRect();
        const x = clientX - gridRect.left - TIME_COL_WIDTH;
        const colW = (gridRect.width - TIME_COL_WIDTH) / 7;
        const dayIdx = Math.max(0, Math.min(6, Math.floor(x / colW)));
        const y = clientY - gridRect.top + scroll.scrollTop;
        const totalMinutes = Math.round(y / HOUR_HEIGHT * 60 / 15) * 15;
        const day = days[dayIdx];
        const eventDate = new Date(day.getTime() + Math.min(Math.max(totalMinutes, 0), 23 * 60) * 60000);
        onLongPress(eventDate);
      },
    });
  }

  // Scroll to current time
  requestAnimationFrame(() => {
    const offset = Math.max(0, timeToTop(today, state.config.timezone) - 128);
    scroll.scrollTop = offset;
  });

  if (timeLine) {
    timerId = setInterval(() => updateCurrentTimeLine(timeLine, state.config.timezone), 60000);
  }
}

function buildNavBar(wStart, callbacks) {
  const wEnd = new Date(wStart.getTime() + 6 * 86400000);
  const nav = document.createElement('div');
  nav.className = 'view-nav';

  const prev = document.createElement('button');
  prev.className = 'nav-arrow';
  prev.textContent = '‹';
  prev.addEventListener('click', () => {
    state.selectedDate = new Date(wStart.getTime() - 7 * 86400000);
    renderWeek(prev.closest('#view-container'), callbacks);
  });

  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const title = document.createElement('span');
  title.className = 'view-nav-title';
  title.textContent = `${fmt(wStart)} – ${fmt(wEnd)}`;

  const todayBtn = document.createElement('button');
  todayBtn.className = 'nav-today-btn';
  todayBtn.textContent = 'Today';
  const now = new Date();
  const thisWeek = now >= wStart && now < new Date(wStart.getTime() + 7 * 86400000);
  todayBtn.hidden = thisWeek;
  todayBtn.addEventListener('click', () => {
    state.selectedDate = new Date();
    renderWeek(prev.closest('#view-container'), callbacks);
  });

  const next = document.createElement('button');
  next.className = 'nav-arrow';
  next.textContent = '›';
  next.addEventListener('click', () => {
    state.selectedDate = new Date(wStart.getTime() + 7 * 86400000);
    renderWeek(next.closest('#view-container'), callbacks);
  });

  nav.appendChild(prev);
  nav.appendChild(title);
  nav.appendChild(todayBtn);
  nav.appendChild(next);
  return nav;
}

function buildDayHeaders(days, today) {
  const row = document.createElement('div');
  row.className = 'week-day-headers';
  const spacer = document.createElement('div');
  spacer.className = 'time-col-spacer';
  row.appendChild(spacer);
  for (const day of days) {
    const dayEnd = new Date(day.getTime() + 86400000);
    const hasEvents = state.events.some(ev =>
      !state.hiddenCalendars.has(ev.calendarId) &&
      new Date(ev.start) < dayEnd && new Date(ev.end) > day
    );
    const cell = document.createElement('div');
    cell.className = 'week-day-header' + (day.toDateString() === today.toDateString() ? ' today' : '');
    cell.innerHTML = `<span class="wdh-name">${day.toLocaleDateString('en-US',{weekday:'short'})}</span><span class="wdh-date">${day.getDate()}</span>${hasEvents ? '<span class="wdh-dot"></span>' : ''}`;
    row.appendChild(cell);
  }
  return row;
}

function buildAllDayRow(days, events, onEventClick) {
  const row = document.createElement('div');
  row.className = 'week-allday-row';
  const spacer = document.createElement('div');
  spacer.className = 'time-col-spacer';
  row.appendChild(spacer);
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const dayStr = localDateStr(day);
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    const cell = document.createElement('div');
    cell.className = 'week-allday-cell';
    for (const ev of events) {
      // All-day: compare by date string (avoids UTC-offset off-by-one)
      // Timed: compare by Date object
      let onDay, isFirst;
      if (ev.allDay) {
        const s = ev.start.slice(0, 10);
        const e = ev.end.slice(0, 10);
        onDay = e > dayStr && s <= dayStr;
        // Show chip on the start day, or on Monday if the series started before this week
        isFirst = i === 0 ? true : s >= dayStr;
      } else {
        const evStart = new Date(ev.start);
        const evEnd = new Date(ev.end);
        onDay = evEnd > day && evStart < dayEnd;
        isFirst = i === 0 ? true : evStart >= day;
      }
      if (!onDay || !isFirst) continue;
      const cal = calendarById(ev.calendarId);
      const chip = document.createElement('div');
      chip.className = 'allday-chip';
      chip.style.background = cal?.color || '#4a90d9';
      chip.textContent = ev.title;
      chip.addEventListener('click', () => onEventClick(ev));
      cell.appendChild(chip);
    }
    row.appendChild(cell);
  }
  return row;
}

export function destroyWeek() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  if (_container) { _container.classList.remove('internal-scroll'); _container = null; }
}
