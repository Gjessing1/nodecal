import { state } from '../app/state.js';
import { markModifiedBlock } from '../views/occurrenceMark.js';
import { getTotalHeight, HOUR_HEIGHT, timeToTop } from './timeGrid.js';

const CONFLICT_LABEL = 'Conflicts with another event';

/**
 * Build a positioned event block for a time-grid column.
 * @param {object} ev - event object from state
 * @param {object} opts
 * @param {string} opts.color - calendar color hex
 * @param {(ev: any) => void} opts.onClick
 * @param {string} [opts.timezone] - IANA timezone for vertical positioning
 * @param {import('../views/eventSegment.js').EventSegment} opts.segment
 * @param {import('../views/timeGridLayout.js').TimeGridLayout} opts.layout
 * @returns {HTMLElement}
 */
export function buildEventBlock(ev, { color, onClick, timezone = 'UTC', segment, layout }) {
  const { start, end, continuesBefore, continuesAfter } = segment;
  const top = continuesBefore ? 0 : timeToTop(start, timezone);
  const rawHeight = ((end.getTime() - start.getTime()) / 60000) * (HOUR_HEIGHT / 60);
  const height = Math.min(Math.max(rawHeight, 24), getTotalHeight() - top);
  const left = (layout.lane / layout.columns) * 100;
  const width = 100 / layout.columns;

  const block = document.createElement('div');
  block.className =
    'event-block' +
    (continuesBefore ? ' continues-before' : '') +
    (continuesAfter ? ' continues-after' : '') +
    (layout.conflict ? ' has-conflict' : '');
  block.style.cssText =
    `--event-left:${left}%;--event-width:${width}%;` +
    `top:${top}px;height:${height}px;background:${color};`;
  block.dataset.id = ev.id;
  if (continuesBefore) block.dataset.continuation = 'true';

  if (height >= 40) block.appendChild(buildTimeLabel(ev, start, continuesBefore));

  const title = document.createElement('span');
  title.className = 'event-block-title';
  title.textContent = ev.title;
  block.appendChild(title);

  if (layout.conflict) markConflict(block, ev.title);

  if (!continuesBefore && !continuesAfter) {
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    block.appendChild(handle);
  }

  markModifiedBlock(block, ev);
  block.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick(ev);
  });
  return block;
}

/** @param {any} ev @param {Date} start @param {boolean} continuesBefore */
function buildTimeLabel(ev, start, continuesBefore) {
  const tz = state.config?.timezone || 'UTC';
  const is12h = state.config?.timeFormat === '12h';
  const label = document.createElement('span');
  label.className = 'event-block-time';
  const labelTime = continuesBefore ? new Date(ev.start) : start;
  label.textContent =
    (continuesBefore ? '\u2191 ' : '') +
    labelTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: is12h,
      timeZone: tz,
    });
  return label;
}

/** @param {HTMLElement} block @param {string} title */
function markConflict(block, title) {
  block.title = CONFLICT_LABEL;
  block.setAttribute('aria-label', `${title}. ${CONFLICT_LABEL}`);
  const mark = document.createElement('span');
  mark.className = 'event-conflict-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.textContent = '!';
  block.appendChild(mark);
}
