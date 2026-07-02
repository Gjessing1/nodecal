// Per-device Web Push opt-in. The server (server/push/scheduler.js) delivers
// event alarms and task reminders to subscribed devices, so reminders arrive
// even when the PWA is closed — unlike the in-page setTimeout fallback, which
// dies as soon as the phone suspends the app.

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** localStorage flag so boot code can decide synchronously to skip in-page timers */
export function pushEnabled() {
  try {
    return localStorage.getItem('nc-push') === '1';
  } catch {
    return false;
  }
}

/** @returns {Promise<PushSubscription|null>} */
export async function getPushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('Push not supported by this browser');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission denied');

  const keyRes = await fetch('/api/push/key');
  if (!keyRes.ok) throw new Error('Could not fetch push key');
  const { publicKey } = await keyRes.json();

  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription }),
  });
  if (!res.ok) throw new Error('Could not register subscription');
  try {
    localStorage.setItem('nc-push', '1');
  } catch {
    /* storage unavailable */
  }
}

export async function disablePush() {
  const subscription = await getPushSubscription();
  if (subscription) {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {
      /* server unreachable — still unsubscribe locally */
    });
    await subscription.unsubscribe();
  }
  try {
    localStorage.removeItem('nc-push');
  } catch {
    /* storage unavailable */
  }
}

/** Web Push requires the VAPID key as a Uint8Array */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
