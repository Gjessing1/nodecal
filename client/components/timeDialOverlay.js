import { createPickerOverlay } from './pickerOverlay.js';
import { buildTimeDial } from './timeDial.js';
import { buildTimeSegments } from './timeSegments.js';
import { pad2 } from './timeFormat.js';

/**
 * Open the drag-a-dial time picker. It is the touch affordance: a thumb sets an
 * hour and a five-minute step far faster than it types one. `onCommit` is called
 * with "HH:MM" only when a time is chosen — closing the overlay changes nothing.
 *
 * @param {object} opts
 * @param {number} opts.hour - 0-23, the time the picker opens on
 * @param {number} opts.minute - 0-59
 * @param {(value: string) => void} opts.onCommit
 */
export function openTimeDial({ hour, minute, onCommit }) {
  let pickHour = hour;
  let pickMinute = minute;
  let mode = 'hour';

  const picker = createPickerOverlay({
    id: 'time-picker-overlay',
    label: 'Choose a time',
    panelClass: 'tp-panel',
  });

  /** @param {string} m */
  function setMode(m) {
    mode = m;
    refresh();
  }

  /**
   * @param {string} which - 'hour' or 'minute'
   * @param {number} delta - steps, an hour or five minutes each
   */
  function step(which, delta) {
    if (which === 'hour') pickHour = (pickHour + delta + 24) % 24;
    else pickMinute = (pickMinute + delta * 5 + 60) % 60;
    setMode(which);
  }

  function commit() {
    onCommit(`${pad2(pickHour)}:${pad2(pickMinute)}`);
    // Delay removal by one frame so the overlay absorbs the pointer-synthesised
    // click instead of passing it through to the field below.
    requestAnimationFrame(picker.close);
  }

  const segs = buildTimeSegments({ onSetMode: setMode, onStep: step, onCommit: commit });

  const dial = buildTimeDial({
    getMode: () => mode,
    getHour: () => pickHour,
    getMinute: () => pickMinute,
    onPick: (which, value) => {
      if (which === 'hour') pickHour = value;
      else pickMinute = value;
      refresh();
    },
    onRelease: () => {
      if (mode === 'hour')
        setMode('minute'); // auto-advance after hour selection
      else commit(); // auto-close after minute selection
    },
  });

  function refresh() {
    segs.update(pickHour, pickMinute, mode);
    dial.render();
  }

  const closeRow = document.createElement('div');
  closeRow.className = 'tp-close-row';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'tp-close-btn';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close without changing the time');
  closeBtn.addEventListener('click', picker.close);
  closeRow.appendChild(closeBtn);

  refresh();
  picker.panel.append(closeRow, segs.row, dial.svg);
  picker.mount(segs.hourSeg);
}
