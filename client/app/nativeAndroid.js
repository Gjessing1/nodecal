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
