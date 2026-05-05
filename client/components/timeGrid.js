export const HOUR_HEIGHT = 64; // px per hour
export const TIME_COL_WIDTH = 44; // px for the hour-label column
const TOTAL_HEIGHT = HOUR_HEIGHT * 24;

/**
 * Pixel offset from midnight for a given Date.
 * @param {Date} date
 */
export function timeToTop(date) {
  return (date.getHours() * 60 + date.getMinutes()) * (HOUR_HEIGHT / 60);
}

/**
 * Build the left-side hour-label column element.
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
 * @returns {HTMLElement}
 */
export function buildEventBlock(ev, color, onClick) {
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const top = timeToTop(start);
  const rawHeight = (end - start) / 60000 * (HOUR_HEIGHT / 60);
  const height = Math.max(rawHeight, 24);

  const block = document.createElement('div');
  block.className = 'event-block';
  block.style.cssText = `top:${top}px;height:${height}px;background:${color};`;
  block.dataset.id = ev.id;

  const title = document.createElement('span');
  title.className = 'event-block-title';
  title.textContent = ev.title;
  block.appendChild(title);

  block.addEventListener('click', e => { e.stopPropagation(); onClick(ev); });
  return block;
}

/**
 * Build or update the current-time indicator element.
 * @returns {HTMLElement}
 */
export function buildCurrentTimeLine() {
  const line = document.createElement('div');
  line.className = 'current-time-line';
  updateCurrentTimeLine(line);
  return line;
}

export function updateCurrentTimeLine(el) {
  el.style.top = `${timeToTop(new Date())}px`;
}

export function getTotalHeight() { return TOTAL_HEIGHT; }
