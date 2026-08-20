/**
 * The Android app's reminder controls.
 *
 * WebView implements neither the Notification nor the Push API, so the browser
 * and Web Push rows this replaces can only ever report "not supported" inside
 * the app. The native shell arms exact alarms against the schedule the server
 * publishes instead, and this row is the switch for it.
 *
 * Like the push toggle it stands in for, this is per-device state owned by
 * Android — it takes effect the moment it is flipped and ignores Save/Cancel.
 */
import {
  getNativeReminderStatus,
  sendNativeTestNotification,
  setNativeRemindersEnabled,
} from '../../app/nativeAndroid.js';
import { buildNativeReminderOptions } from './nativeReminderOptions.js';
import { button, help, toggle } from './fields.js';

export function buildNativeReminders() {
  const wrap = document.createElement('div');
  wrap.className = 'modal-field';
  const status = help('');
  const options = buildNativeReminderOptions();

  /** @param {import('../../app/nativeAndroid.js').NativeReminderStatus} state */
  function applyState(state) {
    paint(status, state);
    options.sync(state);
  }

  const check = toggle(
    'Reminders on this device (works with the app closed)',
    false,
    async (checked, input) => {
      input.disabled = true;
      try {
        const result = await setNativeRemindersEnabled(checked);
        applyState({ ...result, enabled: checked });
      } catch (err) {
        input.checked = !checked;
        status.textContent = '✗ ' + err.message;
        status.dataset.tone = 'bad';
      } finally {
        input.disabled = false;
      }
    },
  );

  const testBtn = button('Test notification', 'ghost', async (el) => {
    el.disabled = true;
    try {
      await sendNativeTestNotification();
    } catch (err) {
      status.textContent = '✗ ' + err.message;
      status.dataset.tone = 'bad';
    } finally {
      el.disabled = false;
    }
  });
  testBtn.classList.add('settings-inline-btn');

  const statusRow = document.createElement('div');
  statusRow.className = 'settings-status-row';
  statusRow.append(status, testBtn);

  // Whether the shell supports reminders can only be settled by asking it.
  // Capacitor's plugin object answers every property with a callable proxy, so
  // an older APK's missing method still looks like a function from here — it is
  // the call that fails, not the lookup.
  const input = /** @type {HTMLInputElement} */ (check.querySelector('input'));
  input.disabled = true;
  testBtn.disabled = true;
  getNativeReminderStatus()
    .then((state) => {
      if (!state) throw new Error('no reminder support');
      input.disabled = false;
      testBtn.disabled = false;
      input.checked = state.enabled;
      applyState(state);
    })
    .catch(() => {
      status.textContent = 'Update the Android app to get reminders';
      status.dataset.tone = 'muted';
    });

  wrap.append(check, statusRow, options.el);
  return wrap;
}

/**
 * @param {HTMLElement} status
 * @param {{enabled: boolean, permissionGranted?: boolean, scheduled?: number}} state
 */
function paint(status, state) {
  if (!state.enabled) {
    status.textContent = '';
    status.dataset.tone = 'muted';
    return;
  }
  if (state.permissionGranted === false) {
    status.textContent = '✗ Android is blocking notifications for Nodecal';
    status.dataset.tone = 'bad';
    return;
  }
  const count = state.scheduled;
  status.textContent =
    typeof count === 'number' && count > 0
      ? `✓ ${count} reminder${count === 1 ? '' : 's'} scheduled`
      : '✓ This device will show reminders';
  status.dataset.tone = 'ok';
}
