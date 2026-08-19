import { buildTimePicker } from '../timePicker.js';
import {
  pushSupported,
  getPushSubscription,
  enablePush,
  disablePush,
} from '../../app/pushClient.js';
import { isNativeAndroid } from '../../app/nativeAndroid.js';
import { buildNativeReminders } from './nativeReminders.js';
import { button, field, groupLabel, help, row, select, toggle } from './fields.js';
import { timeStrToDate } from './timeValue.js';

const EVENT_REMINDERS = [
  { value: '0', label: 'None' },
  { value: '5', label: '5 min before' },
  { value: '10', label: '10 min before' },
  { value: '15', label: '15 min before' },
  { value: '30', label: '30 min before' },
  { value: '60', label: '1 hour before' },
];
const TASK_REMINDERS = [
  { value: 'none', label: 'None' },
  { value: 'on-due', label: 'Morning on due date' },
  { value: 'evening-due', label: 'Evening on due date' },
  { value: 'morning-before', label: 'Morning day before' },
  { value: 'evening-before', label: 'Evening day before' },
];

/**
 * Notifications: the in-page reminder scheduler, the per-device push
 * subscription (or, in the Android app, its native alarm equivalent), and the
 * reminder defaults new events and tasks inherit.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 */
export function renderNotificationsSection(pane, draft) {
  // Both rows below depend on browser APIs the Android WebView does not
  // implement, so in the app they would only ever say "not supported".
  if (isNativeAndroid()) {
    pane.appendChild(buildNativeReminders());
  } else {
    pane.appendChild(buildBrowserNotifications(draft));
    pane.appendChild(buildPushToggle());
  }

  pane.appendChild(groupLabel('Defaults'));
  pane.appendChild(
    row(
      field(
        'Default event reminder',
        select(String(draft.alarmDefaultMinutes ?? 0), EVENT_REMINDERS, (v) => {
          draft.alarmDefaultMinutes = parseInt(v, 10) || 0;
        }),
      ),
      field(
        'Default task reminder',
        select(draft.taskReminderDefault || 'none', TASK_REMINDERS, (v) => {
          draft.taskReminderDefault = v;
        }),
      ),
    ),
  );

  const morning = buildTimePicker(
    's-task-reminder-morning',
    timeStrToDate(draft.taskReminderMorningTime || '09:00'),
    'UTC',
    (value) => {
      draft.taskReminderMorningTime = value;
    },
  );
  const evening = buildTimePicker(
    's-task-reminder-evening',
    timeStrToDate(draft.taskReminderEveningTime || '18:00'),
    'UTC',
    (value) => {
      draft.taskReminderEveningTime = value;
    },
  );
  pane.appendChild(row(field('Morning time', morning), field('Evening time', evening)));
}

function buildBrowserNotifications(draft) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-field';

  const status = help('');
  function paintStatus() {
    if (!('Notification' in window)) {
      status.textContent = 'Not supported by this browser';
      status.dataset.tone = 'muted';
      return;
    }
    const perm = Notification.permission;
    if (perm === 'granted') {
      status.textContent = '✓ Permission granted';
      status.dataset.tone = 'ok';
    } else if (perm === 'denied') {
      status.textContent = '✗ Permission denied — enable in browser settings';
      status.dataset.tone = 'bad';
    } else {
      status.textContent = 'Permission not yet requested';
      status.dataset.tone = 'muted';
    }
  }

  const check = toggle(
    'Enable event reminders (browser notifications)',
    draft.enableNotifications,
    async (checked, input) => {
      draft.enableNotifications = checked;
      if (!checked) return;
      if (!('Notification' in window)) {
        input.checked = false;
        draft.enableNotifications = false;
        alert('Notifications not supported by this browser');
        return;
      }
      if (Notification.permission === 'denied') {
        input.checked = false;
        draft.enableNotifications = false;
        alert('Permission denied — please enable in browser/OS settings.');
        return;
      }
      if (Notification.permission === 'default') {
        const result = await Notification.requestPermission();
        if (result !== 'granted') {
          input.checked = false;
          draft.enableNotifications = false;
        }
      }
      paintStatus();
    },
  );

  const testBtn = button('Test notification', 'ghost', sendTestNotification);
  testBtn.classList.add('settings-inline-btn');

  const statusRow = document.createElement('div');
  statusRow.className = 'settings-status-row';
  statusRow.append(status, testBtn);

  paintStatus();
  wrap.append(check, statusRow);
  return wrap;
}

async function sendTestNotification() {
  if (!('Notification' in window)) {
    alert('Not supported');
    return;
  }
  if (Notification.permission !== 'granted') {
    const result = await Notification.requestPermission();
    if (result !== 'granted') return;
  }
  const body = { body: 'Notifications are working! ✓', icon: '/icons/icon.svg' };
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Nodecal test', body);
      return;
    } catch {
      /* no worker yet — fall through to a page-level notification */
    }
  }
  new Notification('Nodecal test', body);
}

/**
 * Push is a per-device subscription held by the browser, not a setting — it is
 * enabled the moment it is toggled and ignores Save/Cancel entirely.
 */
function buildPushToggle() {
  const wrap = document.createElement('div');
  wrap.className = 'modal-field';
  const status = help('');

  const check = toggle(
    'Push reminders on this device (works with the app closed)',
    false,
    async (checked, input) => {
      input.disabled = true;
      try {
        if (checked) {
          await enablePush();
          status.textContent = '✓ This device receives push reminders';
        } else {
          await disablePush();
          status.textContent = '';
        }
      } catch (err) {
        input.checked = !checked;
        status.textContent = '✗ ' + err.message;
      } finally {
        input.disabled = false;
      }
    },
  );

  const input = /** @type {HTMLInputElement} */ (check.querySelector('input'));
  if (!pushSupported()) {
    input.disabled = true;
    status.textContent = 'Not supported by this browser';
  } else {
    getPushSubscription()
      .then((sub) => {
        input.checked = !!sub;
      })
      .catch(() => {});
  }

  wrap.append(check, status);
  return wrap;
}
