import { openTimeDial } from './timeDialOverlay.js';
import { pad2 } from './timeFormat.js';

/**
 * Which affordance the field offers. A dial is right for a thumb and wrong for
 * a keyboard, so the choice follows the pointer rather than the screen width: a
 * desktop window narrowed to phone size still has a keyboard and still wants to
 * type "09:47" instead of dragging to it.
 */
function prefersTypedTime() {
  return window.matchMedia?.('(pointer: fine)').matches === true;
}

/**
 * Build a time field. Returns a div containing a hidden input (#id) holding
 * "HH:MM" and, next to it, either a typed time input (desktop) or a button that
 * opens the dial picker (touch).
 *
 * Exposes wrap.updateTime(val) for programmatic updates (e.g. NLP feedback and
 * the editor's end-time follows-start rule), which does not fire `onChange`.
 *
 * @param {string} id - id for the hidden input
 * @param {Date} date - initial date/time
 * @param {string} timezone - IANA timezone
 * @param {function(string): void} [onChange] - called with "HH:MM" on change
 */
export function buildTimePicker(id, date, timezone, onChange) {
  const tz = timezone || 'UTC';

  // Parse initial time in the configured timezone. The minute is kept exactly as
  // stored: snapping it to the dial's five-minute grid here silently rewrote the
  // times of existing events just by opening the editor.
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  }).formatToParts(date instanceof Date ? date : new Date());
  let hour = parseInt(parts.find((p) => p.type === 'hour').value) % 24;
  let minute = parseInt(parts.find((p) => p.type === 'minute').value) % 60;

  const wrap = document.createElement('div');
  wrap.className = 'tp-wrap inline-block';

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.id = id;

  function syncValue() {
    hidden.value = `${pad2(hour)}:${pad2(minute)}`;
  }
  syncValue();

  /** @param {string} value - "HH:MM" */
  function setValue(value) {
    const [h, m] = String(value).split(':').map(Number);
    if (!isNaN(h)) hour = ((h % 24) + 24) % 24;
    if (!isNaN(m)) minute = ((m % 60) + 60) % 60;
    syncValue();
    updateDisplay();
  }

  /** @param {string} value - "HH:MM" */
  function commit(value) {
    setValue(value);
    if (onChange) onChange(hidden.value);
  }

  const typed = prefersTypedTime();
  const field = typed ? buildTypedField() : buildDialButton();

  function updateDisplay() {
    if (typed) /** @type {HTMLInputElement} */ (field).value = hidden.value;
    else field.textContent = hidden.value;
  }

  function buildTypedField() {
    const input = document.createElement('input');
    input.type = 'time';
    input.className = 'px-sm text-md font-medium';
    input.value = hidden.value;
    input.addEventListener('change', () => {
      // Half-typed and cleared fields both read as '', and browsers fire change
      // on every segment. Ignore them here rather than fighting the keystroke.
      if (!input.value) return;
      commit(input.value.slice(0, 5));
    });
    input.addEventListener('blur', () => {
      if (!input.value) input.value = hidden.value;
    });
    return input;
  }

  function buildDialButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'min-w-time-field rounded-sm border border-border bg-bg px-md py-sm text-center text-md font-medium hover:bg-surface';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.textContent = hidden.value;
    btn.addEventListener('click', () => openTimeDial({ hour, minute, onCommit: commit }));
    return btn;
  }

  /** @type {any} */ (wrap).updateTime = setValue;

  wrap.append(hidden, field);
  return wrap;
}
