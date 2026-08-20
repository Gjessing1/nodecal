/**
 * How a reminder arrives on this Android device.
 *
 * These live on the phone rather than in settings.json: a reminder fires from a
 * receiver with no network and no WebView, and a lock screen, a launcher badge
 * and an alarm clock are properties of *this* device, not of the calendar. Like
 * the toggle above them they apply the moment they change and ignore
 * Save/Cancel.
 *
 * Native answers every patch with the whole status back, so one round trip both
 * saves the change and re-paints what it affected.
 */
import { setNativeReminderSettings } from '../../app/nativeAndroid.js';
import { buildNativeSystemButtons } from './nativeSystemButtons.js';
import { field, groupLabel, help, row, select, toggle } from './fields.js';

/** @typedef {import('../../app/nativeAndroid.js').NativeReminderStatus} Status */

const STYLES = [
  { value: 'fullscreen', label: 'Full screen' },
  { value: 'banner', label: 'Banner' },
  { value: 'silent', label: 'Silent' },
];
const SNOOZE_OPTIONS = [
  { value: '5', label: '5 minutes' },
  { value: '10', label: '10 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
];

/** An unknown value must never silence a reminder — this mirrors the native side. */
function asStyle(value) {
  if (value === 'fullscreen' || value === 'silent') return value;
  return 'banner';
}

/**
 * The delivery options block. `sync` takes the status native last reported and
 * decides whether the block applies at all.
 * @returns {{el: HTMLElement, sync: function(Status | null): void}}
 */
export function buildNativeReminderOptions() {
  const wrap = document.createElement('div');
  wrap.hidden = true;

  const status = help('');
  const systemButtons = buildNativeSystemButtons(status);
  /** @type {Array<function(Status): void>} */
  const painters = [systemButtons.sync];
  /** @type {Status | null} */
  let applied = null;

  /**
   * @param {Partial<Status>} patch
   * @param {HTMLInputElement | HTMLSelectElement} control
   */
  async function push(patch, control) {
    control.disabled = true;
    try {
      paint(await setNativeReminderSettings(patch));
      status.textContent = '';
      status.dataset.tone = 'muted';
    } catch (err) {
      // The device is the source of truth: put the control back where it is.
      if (applied) paint(applied);
      status.textContent = '✗ ' + err.message;
      status.dataset.tone = 'bad';
    } finally {
      control.disabled = false;
    }
  }

  /** @param {Status} next */
  function paint(next) {
    applied = next;
    for (const painter of painters) painter(next);
  }

  /**
   * @param {string} labelText
   * @param {Array<{value: string, label: string}>} options
   * @param {function(Status): string} readBack
   * @param {function(string, HTMLSelectElement): void} onPick
   */
  function optionSelect(labelText, options, readBack, onPick) {
    const el = select(options[0].value, options, (value) => onPick(value, el));
    painters.push((next) => {
      el.value = readBack(next);
    });
    return field(labelText, el);
  }

  /**
   * @param {string} labelText
   * @param {function(Status): boolean} readBack
   * @param {function(boolean, HTMLInputElement): void} onFlip
   */
  function optionToggle(labelText, readBack, onFlip) {
    const check = toggle(labelText, false, onFlip);
    const input = /** @type {HTMLInputElement} */ (check.querySelector('input'));
    painters.push((next) => {
      input.checked = readBack(next);
    });
    return check;
  }

  wrap.appendChild(groupLabel('Delivery on this device'));
  wrap.appendChild(
    row(
      optionSelect(
        'Event alarm style',
        STYLES,
        (next) => asStyle(next.eventStyle),
        (value, el) => push({ eventStyle: asStyle(value) }, el),
      ),
      optionSelect(
        'Task reminder style',
        STYLES,
        (next) => asStyle(next.taskStyle),
        (value, el) => push({ taskStyle: asStyle(value) }, el),
      ),
    ),
  );
  wrap.appendChild(
    optionSelect(
      'Snooze duration',
      SNOOZE_OPTIONS,
      (next) => String(next.snoozeMinutes),
      (value, el) => push({ snoozeMinutes: parseInt(value, 10) }, el),
    ),
  );

  const toggles = document.createElement('div');
  toggles.className = 'modal-field';
  toggles.append(
    optionToggle(
      'Show a counter on the app icon',
      (next) => next.showBadge !== false,
      (checked, input) => push({ showBadge: checked }, input),
    ),
    optionToggle(
      'Clear fired reminders when the app opens',
      (next) => next.clearOnOpen !== false,
      (checked, input) => push({ clearOnOpen: checked }, input),
    ),
    optionToggle(
      'Keep reminders until dismissed',
      (next) => next.keepUntilDismissed === true,
      (checked, input) => push({ keepUntilDismissed: checked }, input),
    ),
    optionToggle(
      'Fire reminders as system alarms',
      (next) => next.alarmMode === true,
      (checked, input) => push({ alarmMode: checked }, input),
    ),
    help(
      'System alarms are never delayed by battery saving, but Nodecal then owns the alarm icon in the status bar.',
    ),
  );
  wrap.append(toggles, systemButtons.el, status);

  /** @param {Status | null} next */
  function sync(next) {
    // An APK older than 0.1.8 answers without any of these keys. There is
    // nothing to offer it, so the block stays out of the way entirely.
    if (!next || next.eventStyle === undefined) {
      wrap.hidden = true;
      return;
    }
    paint(next);
    wrap.hidden = !next.enabled;
  }

  systemButtons.watch(wrap, sync);
  return { el: wrap, sync };
}
