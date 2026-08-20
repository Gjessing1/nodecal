/** @returns {any | null} */
function nativePlugin() {
  return globalThis.Capacitor?.Plugins?.NodecalNative ?? null;
}

export function isNativeAndroid() {
  return nativePlugin() !== null;
}

export async function getNativeAppInfo() {
  const plugin = nativePlugin();
  if (!plugin) return null;
  return plugin.getInfo();
}

export async function configureNativeServer(serverUrl) {
  const plugin = nativePlugin();
  if (!plugin) throw new Error('Android bridge is unavailable');
  return plugin.configureServer({ serverUrl });
}

export async function openNativeExternal(url) {
  const plugin = nativePlugin();
  if (!plugin) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  await plugin.openExternal({ url });
}

export async function setNativeSystemBarStyle(darkBackground) {
  const systemBars = globalThis.Capacitor?.Plugins?.SystemBars;
  if (!systemBars) return;

  try {
    // Capacitor names styles after the icon color, not the background color.
    await systemBars.setStyle({ style: darkBackground ? 'DARK' : 'LIGHT' });
  } catch {
    // Theme changes should never interrupt the web UI on an older native shell.
  }
}

// ── Reminders ─────────────────────────────────────────────
//
// Android WebView implements neither the Notification nor the Push API, so the
// PWA's reminder paths are dead in the app. The native shell arms local alarms
// against the schedule the server publishes at /api/reminders/upcoming instead.

/**
 * How a reminder is delivered on this device. Everything below `scheduled` is
 * absent on an APK older than 0.1.8, which is how the settings UI decides
 * whether to offer the options at all.
 * @typedef {object} NativeReminderStatus
 * @property {boolean} enabled
 * @property {boolean} permissionGranted
 * @property {number} scheduled
 * @property {boolean} [fullScreenAllowed] - Android 14+ grants this separately.
 * @property {boolean} [exactAlarmsAllowed]
 * @property {'fullscreen'|'banner'|'silent'} [eventStyle]
 * @property {'fullscreen'|'banner'|'silent'} [taskStyle]
 * @property {number} [snoozeMinutes]
 * @property {boolean} [showBadge]
 * @property {boolean} [clearOnOpen]
 * @property {boolean} [keepUntilDismissed]
 * @property {boolean} [alarmMode]
 */

/** @returns {Promise<NativeReminderStatus | null>} */
export async function getNativeReminderStatus() {
  const plugin = nativePlugin();
  if (typeof plugin?.getReminderStatus !== 'function') return null;
  return plugin.getReminderStatus();
}

/**
 * Change one or more delivery options. Native applies them immediately — there
 * is no Save step — and answers with the full status back.
 * @param {Partial<NativeReminderStatus>} patch
 * @returns {Promise<NativeReminderStatus>}
 */
export async function setNativeReminderSettings(patch) {
  const plugin = nativePlugin();
  if (typeof plugin?.setReminderSettings !== 'function') {
    throw new Error('This app version has no reminder options — update the APK');
  }
  return plugin.setReminderSettings(patch);
}

/** Android's own notification screen, which owns sound and vibration. */
export async function openNativeNotificationSettings() {
  const plugin = nativePlugin();
  if (typeof plugin?.openNotificationSettings !== 'function') {
    throw new Error('This app version cannot open notification settings — update the APK');
  }
  await plugin.openNotificationSettings();
}

/** Android 14+ only: the grant screen for full-screen alerts. */
export async function requestNativeFullScreenPermission() {
  const plugin = nativePlugin();
  if (typeof plugin?.requestFullScreenPermission !== 'function') {
    throw new Error('This app version cannot show full-screen alerts — update the APK');
  }
  await plugin.requestFullScreenPermission();
}

/** @param {boolean} enabled */
export async function setNativeRemindersEnabled(enabled) {
  const plugin = nativePlugin();
  if (typeof plugin?.setRemindersEnabled !== 'function') {
    throw new Error('This app version cannot schedule reminders — update the APK');
  }
  return plugin.setRemindersEnabled({ enabled });
}

export async function sendNativeTestNotification() {
  const plugin = nativePlugin();
  if (typeof plugin?.testReminderNotification !== 'function') {
    throw new Error('This app version cannot show notifications — update the APK');
  }
  await plugin.testReminderNotification();
}

/**
 * Return a newer APK published by this Nodecal server, or null.
 * @param {{versionCode: number} | null} installed
 */
export async function findNativeAppUpdate(installed) {
  if (!installed) return null;
  try {
    const response = await fetch('/api/app/version', { cache: 'no-store' });
    if (!response.ok) return null;
    const release = await response.json();
    if (
      !Number.isSafeInteger(release.versionCode) ||
      release.versionCode <= installed.versionCode ||
      typeof release.versionName !== 'string' ||
      typeof release.apkUrl !== 'string'
    ) {
      return null;
    }
    return release;
  } catch {
    return null;
  }
}

export function nativeDownloadUrl(release) {
  return new URL(release.apkUrl, window.location.origin).href;
}
