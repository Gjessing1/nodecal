import { state } from '../app/state.js';

export const HOUR_HEIGHT = 64; // px per hour
export const TIME_COL_WIDTH = 44; // px for the hour-label column
const TOTAL_HEIGHT = HOUR_HEIGHT * 24;

/**
 * Pixel offset from midnight for a given Date, read in the configured timezone.
 * @param {Date} date
 * @param {string} timezone
 */
export function timeToTop(date, timezone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
  }).formatToParts(date);
  const h = parseInt(parts.find(p => p.type === 'hour').value) % 24;
  const m = parseInt(parts.find(p => p.type === 'minute').value);
  return (h * 60 + m) * (HOUR_HEIGHT / 60);
}

/**
 * Build the left-side hour-label column element.
 * Hour labels are timezone-agnostic (always 00–23).
 * @returns {HTMLElement}
 */
export function buildTimeColumn() {
  const col = document.createElement('div');
  col.className = 'time-col';
  for (let h = 0; h < 24; h++) {
    const label = document.createElement('div');
    label.className = 'hour-label';
    label.style.top = `${h * HOUR_HEIGHT}px`;
    label.textContent = h === 0 ? '' : String(h).padStart(2, '0') + ':00';
    col.appendChild(label);
  }
  return col;
}

/**
 * Build the background grid-lines element (sits behind events).
 * @returns {HTMLElement}
 */
export function buildHourLines() {
  const lines = document.createElement('div');
  lines.className = 'hour-lines';
  lines.style.height = `${TOTAL_HEIGHT}px`;
  for (let h = 0; h < 24; h++) {
    const line = document.createElement('div');
    line.className = 'hour-line';
    line.style.top = `${h * HOUR_HEIGHT}px`;
    lines.appendChild(line);
  }
  return lines;
}

/**
 * Build a positioned event block for a time-grid column.
 * @param {object} ev  - event object from state
 * @param {string} color  - calendar color hex
 * @param {function} onClick
 * @param {string} timezone - IANA timezone for vertical positioning
 * @returns {HTMLElement}
 */
export function buildEventBlock(ev, color, onClick, timezone = 'UTC') {
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const top = timeToTop(start, timezone);
  const rawHeight = (end - start) / 60000 * (HOUR_HEIGHT / 60);
  const height = Math.max(rawHeight, 24);

  const block = document.createElement('div');
  block.className = 'event-block';
  block.style.cssText = `top:${top}px;height:${height}px;background:${color};`;
  block.dataset.id = ev.id;

  // Show time label when block is tall enough to fit it alongside the title
  if (height >= 40) {
    const tz = state.config?.timezone || 'UTC';
    const is12h = state.config?.timeFormat === '12h';
    const timeLabel = document.createElement('span');
    timeLabel.className = 'event-block-time';
    timeLabel.textContent = start.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: is12h, timeZone: tz,
    });
    block.appendChild(timeLabel);
  }

  const title = document.createElement('span');
  title.className = 'event-block-title';
  title.textContent = ev.title;
  block.appendChild(title);

  const handle = document.createElement('div');
  handle.className = 'resize-handle';
  block.appendChild(handle);

  block.addEventListener('click', e => { e.stopPropagation(); onClick(ev); });
  return block;
}

/**
 * Build the current-time indicator element.
 * @param {string} timezone
 * @returns {HTMLElement}
 */
export function buildCurrentTimeLine(timezone = 'UTC') {
  const line = document.createElement('div');
  line.className = 'current-time-line';
  updateCurrentTimeLine(line, timezone);
  return line;
}

export function updateCurrentTimeLine(el, timezone = 'UTC') {
  el.style.top = `${timeToTop(new Date(), timezone)}px`;
}

export function getTotalHeight() { return TOTAL_HEIGHT; }

/** Translucent overlay for the night hours (00:00–05:00) in a time-grid column. */
export function buildNightOverlay() {
  const el = document.createElement('div');
  el.className = 'night-overlay';
  el.style.height = `${5 * HOUR_HEIGHT}px`;
  return el;
}
