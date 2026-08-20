import { state } from '../app/state.js';
import { initLongPressCreate } from '../components/dnd.js';
import { localDateStr, weatherIcon } from '../app/utils.js';
import { dayTasks } from './dayItems.js';
import { showDayPopup } from './dayPopup.js';
import { buildChip } from './monthChip.js';
import { buildCellFlag, buildTaskPill } from './monthCellFooter.js';

// One square of the month grid: the date number, the chip rows the week row
// handed this cell, a footer for what did not fit, and the taps that open the
// day. Which events land in which chip row is decided in monthRow.js — a cell
// picking for itself is what let a multi-day bar break where a neighbour filled
// up.

/**
 * @param {Date} day
 * @param {number} curMonth
 * @param {Date} today
 * @param {import('./monthRow.js').CellLayout} layout - this cell's chip rows
 * @param {any} cb - the month view's callbacks
 */
export function buildDayCell(day, curMonth, today, layout, cb) {
  const isToday = day.toDateString() === today.toDateString();
  const isOther = day.getMonth() !== curMonth;
  const dow = day.getDay();
  const isWeekend = (dow === 0 || dow === 6) && state.config.showWeekendBg !== false;
  const dayStr = localDateStr(day);
  // The grid rows start on Monday, so this is the cell's column in its week row.
  const colIdx = (dow + 6) % 7;
  // Tapping anything in the cell that is not an event chip opens the day popup,
  // the same overlay the week view uses.
  const onSelect = () => showDayPopup(new Date(day), dayStr, cb);
  const dayTaskList = dayTasks(dayStr);

  const cell = document.createElement('div');
  cell.className =
    'month-day' +
    (isToday ? ' today' : '') +
    (isOther ? ' other-month' : '') +
    (isWeekend ? ' weekend' : '');
  cell.dataset.day = dayStr;

  cell.appendChild(buildDayNum(day, dayStr, isOther, layout, onSelect));

  const items = document.createElement('div');
  items.className = 'month-day-items';
  for (const ev of layout.slots) {
    // A null slot is a lane another cell's bar is using: an empty chip row keeps
    // the bars in this cell level with the ones on either side of it.
    if (ev) items.appendChild(buildChip(ev, dayStr, colIdx, cb.onEventClick, onSelect));
    else items.appendChild(buildSpacer());
  }
  cell.appendChild(items);

  const pill = buildTaskPill(dayTaskList, onSelect);
  if (pill) cell.appendChild(pill);

  // Chips, pill and date number all stopPropagation, so this is empty space.
  cell.addEventListener('click', onSelect);

  if (cb.onLongPress) {
    initLongPressCreate(cell, {
      skipSelector: '.month-event-chip,.month-task-pill,.month-day-num',
      onLongPress() {
        cb.onLongPress(new Date(day));
      },
    });
  }
  return cell;
}

function buildDayNum(day, dayStr, isOther, layout, onSelect) {
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

  const flag = buildCellFlag(layout.hidden);
  if (flag) numWrap.appendChild(flag);

  numWrap.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelect();
  });
  return numWrap;
}

function buildSpacer() {
  const spacer = document.createElement('div');
  spacer.className = 'month-chip-spacer';
  return spacer;
}
