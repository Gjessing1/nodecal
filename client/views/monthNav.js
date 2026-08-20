import { state } from '../app/state.js';
import { showMonthYearPicker } from '../components/datePicker.js';

// The month view's header: the month being shown with its arrows and Today
// button, and the weekday labels under it. Moving between months lives here too
// — the arrows, the picker and the grid's swipe all go through goToMonth.

export function goToMonth(year, month, rerender) {
  state.selectedDate = new Date(year, month, 1);
  rerender();
}

export function buildNavBar(year, month, rerender) {
  const nav = document.createElement('div');
  nav.className = 'view-nav';

  const prev = document.createElement('button');
  prev.className = 'nav-arrow';
  prev.textContent = '‹';
  prev.addEventListener('click', () => goToMonth(year, month - 1, rerender));

  const title = document.createElement('span');
  title.className = 'view-nav-title clickable-title';
  title.textContent = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  title.addEventListener('click', () => {
    showMonthYearPicker(year, month, (y, m) => goToMonth(y, m, rerender));
  });

  const now = new Date();
  const todayBtn = document.createElement('button');
  todayBtn.className = 'nav-today-btn';
  todayBtn.textContent = 'Today';
  todayBtn.hidden = now.getFullYear() === year && now.getMonth() === month;
  todayBtn.addEventListener('click', () => {
    state.selectedDate = new Date();
    rerender();
  });

  const next = document.createElement('button');
  next.className = 'nav-arrow';
  next.textContent = '›';
  next.addEventListener('click', () => goToMonth(year, month + 1, rerender));

  nav.append(prev, title, todayBtn, next);
  return nav;
}

export function buildWeekDayHeader() {
  const showWN = state.config.showWeekNumbersMonth ?? state.config.showWeekNumbers;
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
