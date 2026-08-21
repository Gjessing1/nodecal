import { state, calendarById } from '../app/state.js';
import { localDateStr, getISOWeek, weatherBadge } from '../app/utils.js';
import {
  buildTimeColumn,
  buildHourLines,
  buildCurrentTimeLine,
  updateCurrentTimeLine,
  getTotalHeight,
  timeToTop,
  buildNightOverlay,
  TIME_COL_WIDTH,
} from '../components/timeGrid.js';
import { buildEventBlock } from '../components/eventBlock.js';
import { initDnd, initSwipe, initLongPressCreate } from '../components/dnd.js';
import { HOUR_HEIGHT } from '../components/timeGrid.js';
import { showDayPopup } from './dayPopup.js';
import { taskSourceVisible } from '../app/taskUtils.js';
import { buildAllDayRow } from './weekAllDay.js';
import { clipEventToDay } from './eventSegment.js';
import { layoutTimeGridSegments } from './timeGridLayout.js';
import { dayWindow, shiftLabel, timeOnDay, todayLabel, todayStr } from '../app/dayWindow.js';

let timerId = null;
let _container = null;
let _lastRenderedWeek = null;

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
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }

  const wStart = weekStart(state.selectedDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(wStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const tz = state.config.timezone;
  // "Today" is the current date in the configured zone, not the browser's — near
  // midnight the two are different days, and the column marked today has to be
  // the one the now-line is drawn in.
  const todayDateStr = todayStr(tz);

  // Re-rendering the same week (completing a task, editing an event) rebuilds the grid;
  // keep the scroll position instead of snapping back to the current time.
  const weekKey = localDateStr(wStart);
  const sameWeek = _lastRenderedWeek === weekKey;
  const prevScrollTop = container.querySelector('.grid-scroll')?.scrollTop || 0;
  _lastRenderedWeek = weekKey;

  container.innerHTML = '';

  // Navigation bar
  container.appendChild(buildNavBar(wStart, callbacks));

  // All-day row (events + optional tasks). All-day events are stored at UTC
  // midnight, so the week window is compared as date strings — new Date() here
  // shifts them by the browser offset and drags in the neighbouring day.
  const weekStartStr = localDateStr(wStart);
  const weekEndStr = localDateStr(days[6]);
  const allDayEvents = state.events.filter((ev) => {
    if (state.hiddenCalendars.has(ev.calendarId)) return false;
    if (!ev.allDay) return false;
    return ev.start.slice(0, 10) <= weekEndStr && ev.end.slice(0, 10) > weekStartStr;
  });
  const showTasksWeek = state.config.showTasksOnWeek ?? state.config.showTasksOnCalendar ?? false;
  const allDayTasks = showTasksWeek
    ? state.tasks.filter(
        (t) =>
          t.status !== 'COMPLETED' &&
          t.due &&
          days.some((d) => localDateStr(d) === t.due) &&
          taskSourceVisible(t, state.hiddenCalendars),
      )
    : [];
  if (allDayEvents.length > 0 || allDayTasks.length > 0) {
    container.appendChild(buildAllDayRow(days, allDayEvents, allDayTasks, callbacks));
  }

  // Day-column headers (date numbers open the day popup on tap)
  container.appendChild(buildDayHeaders(days, todayDateStr, callbacks));

  // Scrollable time grid
  const scroll = document.createElement('div');
  scroll.className = 'grid-scroll';
  const grid = document.createElement('div');
  grid.className = 'week-grid';
  grid.style.height = `${getTotalHeight()}px`;

  grid.appendChild(buildTimeColumn());

  let timeLine = null;
  for (const day of days) {
    const dow = day.getDay();
    const isWeekend = (dow === 0 || dow === 6) && state.config.showWeekendBg !== false;
    const col = document.createElement('div');
    col.className = 'week-day-col' + (isWeekend ? ' weekend' : '');
    col.style.height = `${getTotalHeight()}px`;
    col.appendChild(buildHourLines());
    col.appendChild(buildNightOverlay());

    const dayStr = localDateStr(day);
    const isToday = dayStr === todayDateStr;
    if (isToday) {
      timeLine = buildCurrentTimeLine(tz);
      col.appendChild(timeLine);
    }

    // Blocks are clipped to their own column, so an event running past midnight
    // continues at the top of the next day instead of being redrawn there at
    // the clock time it started at.
    const { start: windowStart, end: windowEnd } = dayWindow(dayStr, tz);
    const daySegments = [];
    for (const ev of state.events) {
      if (ev.allDay || state.hiddenCalendars.has(ev.calendarId)) continue;
      const segment = clipEventToDay(ev, windowStart, windowEnd);
      if (!segment) continue;
      daySegments.push({ ev, segment });
    }
    for (const { ev, segment, layout } of layoutTimeGridSegments(daySegments)) {
      const cal = calendarById(ev.calendarId);
      col.appendChild(
        buildEventBlock(ev, {
          color: cal?.color || '#4a90d9',
          onClick: onEventClick,
          timezone: tz,
          segment,
          layout,
        }),
      );
    }

    grid.appendChild(col);
  }

  scroll.appendChild(grid);
  container.appendChild(scroll);

  // Drag-and-drop
  if (onEventMove && onEventResize) {
    initDnd(grid, scroll, {
      getDayFromX(clientX, gridRect) {
        const x = clientX - gridRect.left - TIME_COL_WIDTH;
        const colW = (gridRect.width - TIME_COL_WIDTH) / 7;
        return days[Math.max(0, Math.min(6, Math.floor(x / colW)))];
      },
      onMove: onEventMove,
      onResize: onEventResize,
    });
  }

  // Swipe navigation
  initSwipe(
    scroll,
    () => {
      state.selectedDate = shiftLabel(wStart, -7);
      renderWeek(container, callbacks);
    },
    () => {
      state.selectedDate = shiftLabel(wStart, 7);
      renderWeek(container, callbacks);
    },
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
        const y = clientY - gridRect.top;
        const totalMinutes = Math.floor((y / HOUR_HEIGHT) * 2) * 30;
        const dayStr = localDateStr(days[dayIdx]);
        onLongPress(timeOnDay(dayStr, Math.min(Math.max(totalMinutes, 0), 23 * 60), tz));
      },
    });
  }

  // Scroll to current time when the week changes
  requestAnimationFrame(() => {
    if (sameWeek && prevScrollTop) {
      scroll.scrollTop = prevScrollTop;
      return;
    }
    const offset = Math.max(0, timeToTop(new Date(), tz) - 128);
    scroll.scrollTop = offset;
  });

  if (timeLine) {
    timerId = setInterval(() => updateCurrentTimeLine(timeLine, tz), 60000);
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
    state.selectedDate = shiftLabel(wStart, -7);
    renderWeek(prev.closest('#view-container'), callbacks);
  });

  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekNum = getISOWeek(wStart);
  const title = document.createElement('span');
  title.className = 'view-nav-title';
  title.textContent = `W${weekNum} · ${fmt(wStart)} – ${fmt(wEnd)}`;

  const todayBtn = document.createElement('button');
  todayBtn.className = 'nav-today-btn';
  todayBtn.textContent = 'Today';
  // Compare date strings, not a `new Date()` instant against the week's labels:
  // the labels are browser-local midnight and the instant is now, so near
  // midnight in a divergent zone the button hid on the wrong week.
  const tz = state.config.timezone;
  const today = todayStr(tz);
  const thisWeek = today >= localDateStr(wStart) && today <= localDateStr(shiftLabel(wStart, 6));
  todayBtn.hidden = thisWeek;
  todayBtn.addEventListener('click', () => {
    state.selectedDate = todayLabel(tz);
    renderWeek(prev.closest('#view-container'), callbacks);
  });

  const next = document.createElement('button');
  next.className = 'nav-arrow';
  next.textContent = '›';
  next.addEventListener('click', () => {
    state.selectedDate = shiftLabel(wStart, 7);
    renderWeek(next.closest('#view-container'), callbacks);
  });

  nav.appendChild(prev);
  nav.appendChild(title);
  nav.appendChild(todayBtn);
  nav.appendChild(next);
  return nav;
}

function buildDayHeaders(days, todayDateStr, callbacks) {
  const row = document.createElement('div');
  row.className = 'week-day-headers';
  const spacer = document.createElement('div');
  spacer.className = 'time-col-spacer';
  row.appendChild(spacer);
  for (const day of days) {
    const dayStr = localDateStr(day);
    const cell = document.createElement('div');
    cell.className = 'week-day-header' + (dayStr === todayDateStr ? ' today' : '');
    const wx = weatherBadge(
      localDateStr(day),
      state.weather,
      state.config.weatherDaysWeek ?? state.config.weatherDays ?? 9,
    );
    cell.innerHTML = `<span class="wdh-name">${day.toLocaleDateString('en-US', { weekday: 'short' })}</span><span class="wdh-date">${day.getDate()}</span>${wx ? `<span class="wdh-weather">${wx}</span>` : ''}`;
    // Tapping the date number opens the day popup
    if (callbacks) {
      const dateSpan = /** @type {HTMLElement|null} */ (cell.querySelector('.wdh-date'));
      if (dateSpan) {
        dateSpan.style.cursor = 'pointer';
        dateSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          showDayPopup(day, dayStr, callbacks);
        });
      }
    }
    row.appendChild(cell);
  }
  return row;
}

/** Forget the kept scroll position so the next render snaps to the current time again. */
export function resetWeekScroll() {
  _lastRenderedWeek = null;
}

export function destroyWeek() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  if (_container) {
    _container.classList.remove('internal-scroll');
    _container = null;
  }
}
