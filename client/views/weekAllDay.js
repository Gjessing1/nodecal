import { calendarById } from '../app/state.js';
import { localDateStr } from '../app/utils.js';
import { showDayPopup } from './dayPopup.js';
import { layoutSpans } from './eventSpans.js';
import { visibleTasks, taskRowCount, appendTaskChips } from './weekAllDayTasks.js';

// The all-day strip above the week grid. It is one CSS grid — the time-column
// spacer plus the seven days — so an event running Monday to Wednesday is a
// single bar placed across those three columns instead of a chip in Monday's
// cell that reads as a one-day event.

/**
 * @param {Date[]} days - the seven visible days, Monday first
 * @param {any[]} events - visible events overlapping the week
 * @param {any[]} tasks - open tasks due inside the week
 * @param {any} cb - the week view's callback bag
 */
export function buildAllDayRow(days, events, tasks, cb) {
  const dayStrs = [];
  for (const day of days) dayStrs.push(localDateStr(day));
  const spans = layoutSpans(events, dayStrs);

  let laneCount = 0;
  for (const span of spans) {
    if (span.lane + 1 > laneCount) laneCount = span.lane + 1;
  }

  const perDayTasks = [];
  let taskRows = 0;
  for (const dayStr of dayStrs) {
    const entry = visibleTasks(tasks, dayStr);
    if (taskRowCount(entry) > taskRows) taskRows = taskRowCount(entry);
    perDayTasks.push(entry);
  }

  const row = document.createElement('div');
  row.className = 'week-allday-row';
  // Explicit rows so the day columns can span 1 / -1; with implicit rows only,
  // -1 resolves back to the grid start and every column collapses to one row.
  row.style.gridTemplateRows = `repeat(${Math.max(1, laneCount + taskRows)}, auto)`;

  const spacer = document.createElement('div');
  spacer.className = 'time-col-spacer';
  spacer.style.gridRow = '1 / -1';
  row.appendChild(spacer);

  // Day columns go in first: they are the separators and the tap target for
  // blank space, and everything else is painted (and hit-tested) over them.
  const openers = [];
  for (let i = 0; i < days.length; i++) {
    const openPopup = popupOpener(days[i], dayStrs[i], cb);
    openers.push(openPopup);
    row.appendChild(buildDayColumn(i, openPopup));
  }
  for (const span of spans) {
    row.appendChild(buildSpanBar(span, cb.onEventClick));
  }
  for (let i = 0; i < days.length; i++) {
    appendTaskChips(row, perDayTasks[i], i, laneCount, openers[i], cb.onTaskClick);
  }
  return row;
}

/**
 * @param {Date} day
 * @param {string} dayStr
 * @param {any} cb
 */
function popupOpener(day, dayStr, cb) {
  return function openPopup() {
    showDayPopup(
      new Date(day),
      dayStr,
      cb.onEventClick,
      cb.onDayClick,
      cb.onTaskComplete,
      cb.onTaskClick,
      cb.onNewTask,
      cb.onLongPress,
    );
  };
}

/**
 * @param {number} colIdx - 0 = Monday
 * @param {() => void} openPopup
 */
function buildDayColumn(colIdx, openPopup) {
  const cell = document.createElement('div');
  cell.className = 'week-allday-cell';
  cell.style.gridColumn = String(colIdx + 2);
  cell.style.gridRow = '1 / -1';
  cell.addEventListener('click', openPopup);
  return cell;
}

/**
 * @param {import('./eventSpans.js').EventSpan} span
 * @param {(ev: any) => void} onEventClick
 */
function buildSpanBar(span, onEventClick) {
  const ev = span.event;
  const bar = document.createElement('div');
  bar.className =
    'allday-chip allday-span' +
    (span.continuesBefore ? ' continues-before' : '') +
    (span.continuesAfter ? ' continues-after' : '');
  bar.style.background = calendarById(ev.calendarId)?.color || '#4a90d9';
  bar.style.gridColumn = `${span.startIdx + 2} / ${span.endIdx + 3}`;
  bar.style.gridRow = String(span.lane + 1);
  bar.title = ev.title;

  if (span.continuesBefore) bar.appendChild(edgeMark('‹'));
  const title = document.createElement('span');
  title.className = 'allday-span-title';
  title.textContent = ev.title;
  bar.appendChild(title);
  if (span.continuesAfter) bar.appendChild(edgeMark('›'));

  bar.addEventListener('click', (e) => {
    e.stopPropagation();
    onEventClick(ev);
  });
  return bar;
}

/** The arrow on a bar that runs past the edge of the visible week. */
function edgeMark(glyph) {
  const el = document.createElement('span');
  el.className = 'allday-span-edge';
  el.textContent = glyph;
  return el;
}
