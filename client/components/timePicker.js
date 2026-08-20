import { createPickerOverlay } from './pickerOverlay.js';
import { buildTimeDial } from './timeDial.js';
import { buildTimeSegments } from './timeSegments.js';
import { pad2 } from './timeFormat.js';

/**
 * Build a tap-to-open time picker.
 * Returns a div containing a hidden input (#id) and a display button.
 * Tapping the button opens an overlay dial picker.
 * Exposes wrap.updateTime(val) for programmatic updates (e.g. NLP).
 *
 * @param {string} id - id for the hidden input
 * @param {Date} date - initial date/time
 * @param {string} timezone - IANA timezone
 * @param {function(string): void} [onChange] - called with "HH:MM" on change
 */
export function buildTimePicker(id, date, timezone, onChange) {
  const tz = timezone || 'UTC';

  // Parse initial time in the configured timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).formatToParts(date instanceof Date ? date : new Date());
  let hour = parseInt(parts.find((p) => p.type === 'hour').value) % 24;
  let minute = (Math.round(parseInt(parts.find((p) => p.type === 'minute').value) / 5) * 5) % 60;

  const wrap = document.createElement('div');
  wrap.className = 'tp-wrap';

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.id = id;

  function syncValue() {
    hidden.value = `${pad2(hour)}:${pad2(minute)}`;
  }
  syncValue();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tp-btn';
  btn.setAttribute('aria-haspopup', 'dialog');

  function updateBtn() {
    btn.textContent = `${pad2(hour)}:${pad2(minute)}`;
  }
  updateBtn();

  btn.addEventListener('click', openPicker);

  function openPicker() {
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
      hour = pickHour;
      minute = pickMinute;
      syncValue();
      if (onChange) onChange(hidden.value);
      updateBtn();
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

  // Programmatic update — called by NLP feedback
  /** @type {any} */ (wrap).updateTime = (val) => {
    const [h, m] = val.split(':').map(Number);
    if (!isNaN(h)) hour = ((h % 24) + 24) % 24;
    if (!isNaN(m)) minute = (Math.round(m / 5) * 5) % 60;
    syncValue();
    updateBtn();
  };

  wrap.append(hidden, btn);
  return wrap;
}
