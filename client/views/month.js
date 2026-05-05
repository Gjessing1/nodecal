import { state, calendarById } from '../app/state.js';

/**
 * @param {HTMLElement} container
 * @param {function(event): void} onEventClick
 * @param {function(Date): void} onDayClick  - called when a day number is tapped
 */
export function renderMonth(container, onEventClick, onDayClick) {
  const anchor = state.selectedDate;
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const today = new Date();

  container.innerHTML = '';
  container.appendChild(buildNavBar(year, month, onEventClick, onDayClick));
  container.appendChild(buildWeekDayHeader());
  container.appendChild(buildGrid(year, month, today, onEventClick, onDayClick));
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
  const row = document.createElement('div');
  row.className = 'month-weekday-row';
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
    const cell = document.createElement('div');
    cell.className = 'month-weekday-label';
    cell.textContent = d;
    row.appendChild(cell);
  }
  return row;
}

function buildGrid(year, month, today, onEventClick, onDayClick) {
  const grid = document.createElement('div');
  grid.className = 'month-grid';

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
    const day = new Date(start.getTime() + i * 86400000);
    grid.appendChild(buildDayCell(day, month, today, monthEvents, onEventClick, onDayClick));
  }
  return grid;
}

function buildDayCell(day, curMonth, today, events, onEventClick, onDayClick) {
  const isToday = day.toDateString() === today.toDateString();
  const isOther = day.getMonth() !== curMonth;

  const cell = document.createElement('div');
  cell.className = 'month-day' + (isToday ? ' today' : '') + (isOther ? ' other-month' : '');

  const numWrap = document.createElement('div');
  numWrap.className = 'month-day-num';
  const numSpan = document.createElement('span');
  numSpan.textContent = day.getDate();
  numWrap.appendChild(numSpan);
  numWrap.addEventListener('click', () => onDayClick && onDayClick(new Date(day)));
  cell.appendChild(numWrap);

  const dayStart = new Date(day);
  const dayEnd = new Date(day.getTime() + 86400000);
  const dayEvs = events
    .filter(ev => new Date(ev.start) < dayEnd && new Date(ev.end) > dayStart)
    .sort((a, b) => (a.allDay ? -1 : 1) - (b.allDay ? -1 : 1) || new Date(a.start) - new Date(b.start));

  const MAX = 2;
  for (let i = 0; i < Math.min(dayEvs.length, MAX); i++) {
    cell.appendChild(buildChip(dayEvs[i], onEventClick));
  }
  if (dayEvs.length > MAX) {
    const more = document.createElement('div');
    more.className = 'month-more';
    more.textContent = `+${dayEvs.length - MAX}`;
    more.addEventListener('click', () => onDayClick && onDayClick(new Date(day)));
    cell.appendChild(more);
  }
  return cell;
}

function buildChip(ev, onClick) {
  const cal = calendarById(ev.calendarId);
  const chip = document.createElement('div');
  chip.className = 'month-event-chip';
  chip.style.background = cal?.color || '#4a90d9';
  if (!ev.allDay) {
    const h = new Date(ev.start).getHours();
    const m = String(new Date(ev.start).getMinutes()).padStart(2, '0');
    chip.textContent = `${h}:${m} ${ev.title}`;
  } else {
    chip.textContent = ev.title;
  }
  chip.addEventListener('click', e => { e.stopPropagation(); onClick(ev); });
  return chip;
}
