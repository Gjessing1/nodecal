import { state, calendarById } from '../app/state.js';
import { toTimeInputValue } from '../app/utils.js';
import { eventDayRange, spanPosition } from './eventSpans.js';
import { markModifiedBlock } from './occurrenceMark.js';

// One event chip inside a month cell. A multi-day event still gets a chip per
// day — the grid's drag-and-drop and its day taps work off real cells, and an
// absolute overlay would take both away — but the chips are squared off and
// pulled over the cell padding where the run continues, and only the first one
// in a week row carries the title. That is what turns three unrelated chips
// with the same words in them into one bar.

/**
 * @param {any} ev
 * @param {string} dayStr - the cell's local date, YYYY-MM-DD
 * @param {number} colIdx - 0 = Monday, the first column of the week row
 * @param {(ev: any) => void} onClick
 * @param {() => void} onSelectDay
 */
export function buildChip(ev, dayStr, colIdx, onClick, onSelectDay) {
  const cal = calendarById(ev.calendarId);
  const color = cal?.color || '#4a90d9';
  const range = eventDayRange(ev);
  const spans = range.startStr !== range.endStr;
  const position = spanPosition(range, dayStr);

  const chip = document.createElement('div');
  chip.dataset.id = ev.id;
  const tz = state.config?.timezone || 'UTC';
  const [th, tm] = toTimeInputValue(new Date(ev.start), tz).split(':').map(Number);
  chip.dataset.startMin = String(th * 60 + tm);
  chip.title = ev.title;

  // A run of days only reads as one bar if it is filled, so a timed event that
  // crosses midnight gives up the outlined single-day style.
  if (ev.allDay || spans) {
    // All-day events: solid color fill (high visibility)
    chip.className = 'month-event-chip';
    chip.style.background = color;
  } else {
    // Timed events: colored left border, title only (no time prefix — more room for text)
    chip.className = 'month-event-chip month-event-timed';
    chip.style.borderLeftColor = color;
    chip.style.color = color;
  }
  if (spans) chip.classList.add('span-' + position);

  // Labelled on the day it starts and again on the Monday it continues into.
  // Repeating the title in every cell is what made a run look like separate
  // events; the days in between are the bar carrying on.
  const labelled = position === 'single' || position === 'start' || colIdx === 0;
  chip.textContent = labelled ? ev.title : '';

  markModifiedBlock(chip, ev);

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    // A chip is a few pixels tall on a phone, so a touch is more likely aimed at
    // the day than at that one event; with a mouse it is a deliberate hit.
    if (window.matchMedia('(pointer: coarse)').matches) onSelectDay();
    else onClick(ev);
  });
  return chip;
}
