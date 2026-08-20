import { state, calendarById } from '../app/state.js';
import { initLongPressCreate } from '../components/dnd.js';
import { localDateStr, weatherIcon, toTimeInputValue } from '../app/utils.js';
import { dayEvents, dayTasks } from './dayItems.js';

// One square of the month grid: the date number, up to two event chips, a task
// pill, and the taps that select the day.

// Selecting a day opens the sheet under the grid; re-tapping the same day closes
// it, so the gesture that opened it also puts the grid back.
function selectDay(dayStr, rerender) {
  state.selectedDay = state.selectedDay === dayStr ? null : dayStr;
  rerender();
}

export function buildDayCell(day, curMonth, today, events, cb, rerender, compressed) {
  const isToday = day.toDateString() === today.toDateString();
  const isOther = day.getMonth() !== curMonth;
  const dow = day.getDay();
  const isWeekend = (dow === 0 || dow === 6) && state.config.showWeekendBg !== false;
  const dayStr = localDateStr(day);
  const isSelected = state.selectedDay === dayStr;

  const cell = document.createElement('div');
  cell.className =
    'month-day' +
    (isToday ? ' today' : '') +
    (isOther ? ' other-month' : '') +
    (isWeekend ? ' weekend' : '') +
    (isSelected ? ' selected' : '');
  cell.dataset.day = dayStr;

  const numWrap = document.createElement('div');
  numWrap.className = 'month-day-num';
  const numSpan = document.createElement('span');
  numSpan.textContent = String(day.getDate());
  numWrap.appendChild(numSpan);
  const wx = weatherIcon(
    dayStr,
    state.weather,
    state.config.weatherDaysMonth ?? state.config.weatherDays ?? 4,
  );
  if (wx && !isOther) {
    const wxEl = document.createElement('span');
    wxEl.className = 'month-weather';
    wxEl.textContent = wx;
    numWrap.appendChild(wxEl);
  }
  numWrap.addEventListener('click', (e) => {
    e.stopPropagation();
    selectDay(dayStr, rerender);
  });
  cell.appendChild(numWrap);

  const dayEvs = dayEvents(day, dayStr, events);
  const dayTaskList = dayTasks(dayStr);

  // One chip while the sheet is open — the rows are roughly half height then,
  // and the sheet is already showing the full list anyway.
  const max = compressed ? 1 : 2;
  for (let i = 0; i < Math.min(dayEvs.length, max); i++) {
    cell.appendChild(buildChip(dayEvs[i], cb.onEventClick, () => selectDay(dayStr, rerender)));
  }
  if (dayEvs.length > max) {
    const more = document.createElement('div');
    more.className = 'month-more';
    more.textContent = `+${dayEvs.length - max}`;
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      selectDay(dayStr, rerender);
    });
    cell.appendChild(more);
  }
  if (dayTaskList.length > 0) cell.appendChild(buildTaskPill(dayTaskList, dayStr, rerender));

  // Chips, pill and date number all stopPropagation, so this is empty space.
  cell.addEventListener('click', () => selectDay(dayStr, rerender));

  if (cb.onLongPress) {
    initLongPressCreate(cell, {
      skipSelector: '.month-event-chip,.month-more,.month-task-pill,.month-day-num',
      onLongPress() {
        cb.onLongPress(new Date(day));
      },
    });
  }
  return cell;
}

function buildTaskPill(tasks, dayStr, rerender) {
  const MAX_TASK_TITLE = 16;
  const pill = document.createElement('div');
  pill.className = 'month-task-pill';
  if (tasks.length === 1) {
    const t = tasks[0].title;
    pill.textContent = t.length > MAX_TASK_TITLE ? t.slice(0, MAX_TASK_TITLE) + '…' : t;
  } else {
    pill.textContent = `${tasks.length} tasks`;
  }
  pill.style.cursor = 'pointer';
  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    selectDay(dayStr, rerender);
  });
  return pill;
}

function buildChip(ev, onClick, onSelectDay) {
  const cal = calendarById(ev.calendarId);
  const color = cal?.color || '#4a90d9';
  const chip = document.createElement('div');
  chip.dataset.id = ev.id;
  const start = new Date(ev.start);
  const tz = state.config?.timezone || 'UTC';
  const [th, tm] = toTimeInputValue(start, tz).split(':').map(Number);
  chip.dataset.startMin = String(th * 60 + tm);

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

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    // A chip is a few pixels tall on a phone, so a touch is more likely aimed at
    // the day than at that one event; with a mouse it is a deliberate hit.
    if (window.matchMedia('(pointer: coarse)').matches) onSelectDay();
    else onClick(ev);
  });
  return chip;
}
