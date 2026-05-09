import { state, calendarById } from '../app/state.js';
import { initDayDnd, initLongPressCreate, initSwipe } from '../components/dnd.js';
import { localDateStr, getISOWeek, weatherIcon, weatherBadge } from '../app/utils.js';

/**
 * @param {HTMLElement} container
 * @param {function(event): void} onEventClick
 * @param {function(Date): void} onDayClick
 * @param {function(id, day, startMin): void} onEventMove
 * @param {function(): void} [onTasksClick] - called when "N tasks" pill is clicked
 * @param {function(Date): void} [onLongPress] - called with the day Date on long-press
 * @param {function(task): void} [onTaskComplete] - toggle task completion from popup
 * @param {function(task): void} [onTaskClick] - open task for editing from popup
 * @param {function(Date): void} [onNewTask] - open new task modal for a given day
 */
export function renderMonth(container, onEventClick, onDayClick, onEventMove, onTasksClick, onLongPress, onTaskComplete, onTaskClick, onNewTask) {
  const anchor = state.selectedDate;
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const today = new Date();

  container.innerHTML = '';
  container.appendChild(buildNavBar(year, month, onEventClick, onDayClick));
  container.appendChild(buildWeekDayHeader());
  const grid = buildGrid(year, month, today, onEventClick, onDayClick, onTasksClick, onLongPress, onTaskComplete, onTaskClick, onNewTask);
  container.appendChild(grid);

  if (onEventMove) {
    initDayDnd(grid, {
      chipSelector: '.month-event-chip',
      daySelector: '.month-day',
      onMove: onEventMove,
    });
  }

  // Swipe left/right to navigate months
  initSwipe(grid,
    () => { state.selectedDate = new Date(year, month - 1, 1); renderMonth(container, onEventClick, onDayClick, onEventMove, onTasksClick, onLongPress, onTaskComplete, onTaskClick, onNewTask); },
    () => { state.selectedDate = new Date(year, month + 1, 1); renderMonth(container, onEventClick, onDayClick, onEventMove, onTasksClick, onLongPress, onTaskComplete, onTaskClick, onNewTask); },
  );
}

function buildNavBar(year, month, onEventClick, onDayClick) {
  const nav = document.createElement('div');
  nav.className = 'view-nav';

  const prev = document.createElement('button');
  prev.className = 'nav-arrow';
  prev.textContent = '‹';
  prev.addEventListener('click', () => {
    state.selectedDate = new Date(year, month - 1, 1);
    renderMonth(prev.closest('#view-container'), onEventClick, onDayClick);
  });

  const title = document.createElement('span');
  title.className = 'view-nav-title';
  title.textContent = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const now = new Date();
  const todayBtn = document.createElement('button');
  todayBtn.className = 'nav-today-btn';
  todayBtn.textContent = 'Today';
  todayBtn.hidden = now.getFullYear() === year && now.getMonth() === month;
  todayBtn.addEventListener('click', () => {
    state.selectedDate = new Date();
    renderMonth(prev.closest('#view-container'), onEventClick, onDayClick);
  });

  const next = document.createElement('button');
  next.className = 'nav-arrow';
  next.textContent = '›';
  next.addEventListener('click', () => {
    state.selectedDate = new Date(year, month + 1, 1);
    renderMonth(next.closest('#view-container'), onEventClick, onDayClick);
  });

  nav.appendChild(prev);
  nav.appendChild(title);
  nav.appendChild(todayBtn);
  nav.appendChild(next);
  return nav;
}

function buildWeekDayHeader() {
  const showWN = state.config.showWeekNumbers;
  const row = document.createElement('div');
  row.className = 'month-weekday-row' + (showWN ? ' with-weeknum' : '');
  if (showWN) {
    const wn = document.createElement('div');
    wn.className = 'month-weekday-label month-weeknum-label';
    wn.textContent = 'W';
    row.appendChild(wn);
  }
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    const cell = document.createElement('div');
    cell.className = 'month-weekday-label';
    cell.textContent = d;
    row.appendChild(cell);
  }
  return row;
}

function buildGrid(year, month, today, onEventClick, onDayClick, onTasksClick, onLongPress, onTaskComplete, onTaskClick, onNewTask) {
  const showWN = state.config.showWeekNumbers;
  const grid = document.createElement('div');
  grid.className = 'month-grid' + (showWN ? ' with-weeknum' : '');

  // Monday-anchored start of the first displayed week
  const firstOfMonth = new Date(year, month, 1);
  const dow = firstOfMonth.getDay(); // 0=Sun
  const startOffset = dow === 0 ? 6 : dow - 1;
  const start = new Date(year, month, 1 - startOffset);
  const end = new Date(start.getTime() + 42 * 86400000);

  const monthEvents = state.events.filter(ev => {
    if (state.hiddenCalendars.has(ev.calendarId)) return false;
    return new Date(ev.start) < end && new Date(ev.end) > start;
  });

  for (let i = 0; i < 42; i++) {
    const raw = new Date(start.getTime() + i * 86400000);
    // Re-anchor to local midnight so DST transitions don't produce 01:00 cells
    const day = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
    // Insert week number cell at start of each week row
    if (showWN && i % 7 === 0) {
      const wn = document.createElement('div');
      wn.className = 'month-weeknum-cell';
      wn.textContent = 'W' + getISOWeek(day);
      grid.appendChild(wn);
    }
    grid.appendChild(buildDayCell(day, month, today, monthEvents, onEventClick, onDayClick, onTasksClick, onLongPress, onTaskComplete, onTaskClick, onNewTask));
  }
  return grid;
}

function buildDayCell(day, curMonth, today, events, onEventClick, onDayClick, onTasksClick, onLongPress, onTaskComplete, onTaskClick, onNewTask) {
  const isToday = day.toDateString() === today.toDateString();
  const isOther = day.getMonth() !== curMonth;
  const dow = day.getDay();
  const isWeekend = (dow === 0 || dow === 6) && state.config.showWeekendBg !== false;

  const cell = document.createElement('div');
  cell.className = 'month-day' + (isToday ? ' today' : '') + (isOther ? ' other-month' : '') + (isWeekend ? ' weekend' : '');
  cell.dataset.day = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;

  const numWrap = document.createElement('div');
  numWrap.className = 'month-day-num';
  const numSpan = document.createElement('span');
  numSpan.textContent = day.getDate();
  numWrap.appendChild(numSpan);
  const wx = weatherIcon(localDateStr(day), state.weather, state.config.weatherDaysMonth ?? state.config.weatherDays ?? 4);
  if (wx && !isOther) {
    const wxEl = document.createElement('span');
    wxEl.className = 'month-weather';
    wxEl.textContent = wx;
    numWrap.appendChild(wxEl);
  }
  numWrap.addEventListener('click', e => {
    e.stopPropagation();
    showDayPopup(day, dayStr, onEventClick, onDayClick, onTaskComplete, onTaskClick, onNewTask);
  });
  cell.appendChild(numWrap);

  const dayStr = localDateStr(day);
  const dayStart = new Date(day);
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const dayEvs = events
    .filter(ev => {
      if (ev.allDay) return ev.start.slice(0, 10) <= dayStr && ev.end.slice(0, 10) > dayStr;
      return new Date(ev.start) < dayEnd && new Date(ev.end) > dayStart;
    })
    .sort((a, b) => (a.allDay ? -1 : 1) - (b.allDay ? -1 : 1) || new Date(a.start) - new Date(b.start));

  const dayTasks = (state.config.showTasksOnMonth ?? state.config.showTasksOnCalendar)
    ? state.tasks.filter(t => t.due === dayStr && t.status !== 'COMPLETED')
    : [];

  const MAX = 2;
  for (let i = 0; i < Math.min(dayEvs.length, MAX); i++) {
    cell.appendChild(buildChip(dayEvs[i], onEventClick));
  }
  if (dayEvs.length > MAX) {
    const more = document.createElement('div');
    more.className = 'month-more';
    more.textContent = `+${dayEvs.length - MAX}`;
    more.addEventListener('click', e => { e.stopPropagation(); onDayClick && onDayClick(new Date(day)); });
    cell.appendChild(more);
  }
  if (dayTasks.length > 0) {
    const pill = document.createElement('div');
    pill.className = 'month-task-pill';
    const MAX_TASK_TITLE = 16;
    const taskLabel = dayTasks.length === 1
      ? (dayTasks[0].title.length > MAX_TASK_TITLE
          ? dayTasks[0].title.slice(0, MAX_TASK_TITLE) + '…'
          : dayTasks[0].title)
      : `${dayTasks.length} tasks`;
    pill.textContent = taskLabel;
    // Clicking the task pill opens the day popup (same as clicking the date number)
    pill.style.cursor = 'pointer';
    pill.addEventListener('click', e => { e.stopPropagation(); showDayPopup(day, dayStr, onEventClick, onDayClick, onTaskComplete, onTaskClick, onNewTask); });
    cell.appendChild(pill);
  }

  // Clicking empty cell space opens popup (chips/pill/num all stopPropagation)
  cell.addEventListener('click', () => showDayPopup(day, dayStr, onEventClick, onDayClick, onTaskComplete, onTaskClick, onNewTask));

  if (onLongPress) {
    initLongPressCreate(cell, {
      skipSelector: '.month-event-chip,.month-more,.month-task-pill,.month-day-num',
      onLongPress() { onLongPress(new Date(day)); },
    });
  }

  return cell;
}

function buildChip(ev, onClick) {
  const cal = calendarById(ev.calendarId);
  const color = cal?.color || '#4a90d9';
  const chip = document.createElement('div');
  chip.dataset.id = ev.id;
  const start = new Date(ev.start);
  chip.dataset.startMin = String(start.getHours() * 60 + start.getMinutes());

  if (ev.allDay) {
    // All-day events: solid color fill (high visibility)
    chip.className = 'month-event-chip';
    chip.style.background = color;
    chip.textContent = ev.title;
  } else {
    // Timed events: colored left border, title only (no time prefix — more room for text)
    chip.className = 'month-event-chip month-event-timed';
    chip.style.borderLeftColor = color;
    chip.style.color = color;
    chip.textContent = ev.title;
  }

  chip.addEventListener('click', e => { e.stopPropagation(); onClick(ev); });
  return chip;
}

function showDayPopup(day, dayStr, onEventClick, onDayClick, onTaskComplete, onTaskClick, onNewTask) {
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
    ? state.tasks.filter(t => t.due === dayStr && t.status !== 'COMPLETED')
    : [];

  const overlay = document.createElement('div');
  overlay.id = 'month-day-popup';
  overlay.className = 'month-popup-overlay';
  overlay.addEventListener('click', () => overlay.remove());

  const panel = document.createElement('div');
  panel.className = 'month-popup-panel';
  panel.addEventListener('click', e => e.stopPropagation());

  // Heading: date + weather badge + close button
  const heading = document.createElement('div');
  heading.className = 'month-popup-heading';
  const headingLeft = document.createElement('div');
  headingLeft.className = 'month-popup-heading-left';
  headingLeft.textContent = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const wx = weatherBadge(dayStr, state.weather, state.config.weatherDaysMonth ?? state.config.weatherDays ?? 4);
  if (wx) {
    const wxSpan = document.createElement('span');
    wxSpan.className = 'month-popup-weather';
    wxSpan.textContent = wx;
    headingLeft.appendChild(wxSpan);
  }
  const closeBtn = document.createElement('button');
  closeBtn.className = 'month-popup-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => overlay.remove());
  heading.appendChild(headingLeft);
  heading.appendChild(closeBtn);
  panel.appendChild(heading);

  if (!dayEvs.length && !dayTasks.length) {
    const empty = document.createElement('p');
    empty.className = 'month-popup-empty';
    empty.textContent = 'Nothing scheduled';
    panel.appendChild(empty);
  }

  // Events first
  for (const ev of dayEvs) {
    const row = document.createElement('div');
    row.className = 'month-popup-event';
    const cal = calendarById(ev.calendarId);
    const dot = document.createElement('span');
    dot.className = 'month-popup-dot';
    dot.style.background = cal?.color || '#4a90d9';
    const info = document.createElement('div');
    info.className = 'month-popup-info';
    const title = document.createElement('div');
    title.className = 'month-popup-title';
    title.textContent = ev.title;
    info.appendChild(title);
    if (!ev.allDay) {
      const time = document.createElement('div');
      time.className = 'month-popup-time';
      time.textContent = new Date(ev.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: state.config.timeFormat === '12h', timeZone: tz });
      info.appendChild(time);
    }
    row.appendChild(dot);
    row.appendChild(info);
    row.addEventListener('click', () => { overlay.remove(); onEventClick(ev); });
    panel.appendChild(row);
  }

  // Tasks after events
  for (const task of dayTasks) {
    const row = document.createElement('div');
    row.className = 'month-popup-task';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'month-popup-task-check';
    checkbox.checked = task.status === 'COMPLETED';
    checkbox.addEventListener('click', e => {
      e.stopPropagation();
      if (onTaskComplete) onTaskComplete(task);
      overlay.remove();
    });

    const title = document.createElement('div');
    title.className = 'month-popup-title';
    title.textContent = task.title;

    row.appendChild(checkbox);
    row.appendChild(title);
    row.addEventListener('click', () => { overlay.remove(); if (onTaskClick) onTaskClick(task); });
    panel.appendChild(row);
  }

  const footer = document.createElement('div');
  footer.className = 'month-popup-footer';

  if (onNewTask) {
    const newTaskBtn = document.createElement('button');
    newTaskBtn.className = 'btn btn-ghost month-popup-new-task';
    newTaskBtn.textContent = '+ New task';
    newTaskBtn.addEventListener('click', () => { overlay.remove(); onNewTask(new Date(day)); });
    footer.appendChild(newTaskBtn);
  }
  if (onDayClick) {
    const viewBtn = document.createElement('button');
    viewBtn.className = 'month-popup-view-day btn btn-ghost';
    viewBtn.textContent = 'Open day view →';
    viewBtn.addEventListener('click', () => { overlay.remove(); onDayClick(new Date(day)); });
    footer.appendChild(viewBtn);
  }
  if (footer.children.length) panel.appendChild(footer);

  overlay.appendChild(panel);
  document.getElementById('app')?.appendChild(overlay);
}
