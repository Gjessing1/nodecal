/**
 * The two reminder controls that are not ours to render: sound and vibration,
 * which Android owns per notification channel, and the separate grant Android
 * 14 introduced before an app may take over the screen. Both are a button that
 * hands the user the system screen.
 */
import {
  getNativeReminderStatus,
  openNativeNotificationSettings,
  requestNativeFullScreenPermission,
} from '../../app/nativeAndroid.js';
import { button, field } from './fields.js';

/** @typedef {import('../../app/nativeAndroid.js').NativeReminderStatus} Status */

/**
 * @param {HTMLElement} status - the shared status line, painted if a screen won't open
 * @returns {{
 *   el: HTMLElement,
 *   sync: function(Status): void,
 *   watch: function(HTMLElement, function(Status): void): void,
 * }}
 */
export function buildNativeSystemButtons(status) {
  const wrap = document.createElement('div');

  const soundBtn = button('Notification sound & vibration', 'ghost', (el) =>
    launch(el, openNativeNotificationSettings),
  );
  wrap.appendChild(
    field('', soundBtn, 'Android owns the sound and vibration of each reminder channel.'),
  );

  const fullScreenBtn = button('Allow full-screen alerts', 'ghost', (el) =>
    launch(el, requestNativeFullScreenPermission),
  );
  const fullScreenField = field(
    '',
    fullScreenBtn,
    'Android 14 and later withholds this until granted, and a full-screen reminder needs it.',
  );
  fullScreenField.hidden = true;
  wrap.appendChild(fullScreenField);

  /**
   * @param {HTMLButtonElement} el
   * @param {function(): Promise<void>} open
   */
  async function launch(el, open) {
    el.disabled = true;
    try {
      await open();
    } catch (err) {
      status.textContent = '✗ ' + err.message;
      status.dataset.tone = 'bad';
    } finally {
      el.disabled = false;
    }
  }

  /** The grant button is only worth showing while a style is asking for it. */
  function sync(next) {
    const wantsFullScreen = next.eventStyle === 'fullscreen' || next.taskStyle === 'fullscreen';
    fullScreenField.hidden = !wantsFullScreen || next.fullScreenAllowed !== false;
  }

  /**
   * Both buttons leave the app, so what the user did there is only knowable
   * once it comes back. The listener retires itself with `owner`.
   * @param {HTMLElement} owner
   * @param {function(Status): void} onReturn
   */
  function watch(owner, onReturn) {
    async function refresh() {
      if (!owner.isConnected) {
        document.removeEventListener('visibilitychange', refresh);
        return;
      }
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await getNativeReminderStatus();
        if (next) onReturn(next);
      } catch {
        /* leave the controls where they are; native will answer next time */
      }
    }
    document.addEventListener('visibilitychange', refresh);
  }

  return { el: wrap, sync, watch };
}
