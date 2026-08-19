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
  nativeRemindersSupported,
  sendNativeTestNotification,
  setNativeRemindersEnabled,
} from '../../app/nativeAndroid.js';
import { button, help, toggle } from './fields.js';

export function buildNativeReminders() {
  const wrap = document.createElement('div');
  wrap.className = 'modal-field';
  const status = help('');

  const check = toggle(
    'Reminders on this device (works with the app closed)',
    false,
    async (checked, input) => {
      input.disabled = true;
      try {
        const result = await setNativeRemindersEnabled(checked);
        paint(status, { enabled: checked, ...result });
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

  const input = /** @type {HTMLInputElement} */ (check.querySelector('input'));
  if (!nativeRemindersSupported()) {
    input.disabled = true;
    testBtn.disabled = true;
    status.textContent = 'Update the Android app to get reminders';
    status.dataset.tone = 'muted';
  } else {
    getNativeReminderStatus()
      .then((state) => {
        if (!state) return;
        input.checked = state.enabled;
        paint(status, state);
      })
      .catch(() => {});
  }

  wrap.append(check, statusRow);
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
