import { pad2 } from './timeFormat.js';

/**
 * The big "HH : MM" row at the top of the time picker.
 *
 * Tapping a segment picks which one the dial edits — that is the touch path and
 * is unchanged. Each segment is also a spinbutton, so a keyboard or screen
 * reader user can hear the current value and change it with the arrow keys
 * without ever touching the dial; Enter confirms the time.
 *
 * @param {object} handlers
 * @param {(mode: string) => void} handlers.onSetMode
 * @param {(mode: string, delta: number) => void} handlers.onStep
 * @param {() => void} handlers.onCommit
 * @returns {{ row: HTMLElement, hourSeg: HTMLElement,
 *   update: (hour: number, minute: number, mode: string) => void }}
 */
export function buildTimeSegments({ onSetMode, onStep, onCommit }) {
  const row = document.createElement('div');
  row.className = 'time-picker-display';

  const hourSeg = makeSegment('Hour', 0, 23);
  const minSeg = makeSegment('Minute', 0, 55);

  const colonEl = document.createElement('span');
  colonEl.className = 'time-picker-colon';
  colonEl.textContent = ':';
  colonEl.setAttribute('aria-hidden', 'true');

  /** @param {Event} e */
  function modeOf(e) {
    return e.currentTarget === hourSeg ? 'hour' : 'minute';
  }

  /** @param {Event} e */
  function onSegClick(e) {
    onSetMode(modeOf(e));
  }

  /** @param {KeyboardEvent} e */
  function onSegKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onCommit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onStep(modeOf(e), 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onStep(modeOf(e), -1);
    }
  }

  for (const seg of [hourSeg, minSeg]) {
    seg.addEventListener('click', onSegClick);
    seg.addEventListener('keydown', onSegKeydown);
  }
  row.append(hourSeg, colonEl, minSeg);

  /**
   * @param {number} hour
   * @param {number} minute
   * @param {string} mode
   */
  function update(hour, minute, mode) {
    setValue(hourSeg, hour, 'hours');
    setValue(minSeg, minute, 'minutes');
    hourSeg.classList.toggle('active', mode === 'hour');
    minSeg.classList.toggle('active', mode === 'minute');
  }

  return { row, hourSeg, update };
}

/**
 * @param {string} label
 * @param {number} min
 * @param {number} max
 */
function makeSegment(label, min, max) {
  const seg = document.createElement('button');
  seg.type = 'button';
  seg.className = 'time-picker-seg';
  seg.setAttribute('role', 'spinbutton');
  seg.setAttribute('aria-label', label);
  seg.setAttribute('aria-valuemin', String(min));
  seg.setAttribute('aria-valuemax', String(max));
  return seg;
}

/**
 * @param {HTMLElement} seg
 * @param {number} value
 * @param {string} unit
 */
function setValue(seg, value, unit) {
  seg.textContent = pad2(value);
  seg.setAttribute('aria-valuenow', String(value));
  seg.setAttribute('aria-valuetext', `${value} ${unit}`);
}
