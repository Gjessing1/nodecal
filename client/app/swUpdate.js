// Service-worker registration + update lifecycle.
//
// The server bakes a content hash into /service-worker.js, so a deploy makes
// the fetched script differ and the browser installs the new worker. This
// module closes the two gaps that used to require reinstalling the PWA:
//  - resident pages (a home-screen PWA resumes from memory for days without
//    re-running this module) re-check on foreground/online and hourly;
//  - the switch to the new worker happens in one controlled reload, never by
//    silently swapping caches under a running page.
import { showSnackbar } from '../components/snackbar.js';

const CHECK_MIN_GAP_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
// Within this window after launch nothing is in progress, so a ready update
// activates silently instead of prompting.
const BOOT_AUTO_MS = 10 * 1000;

const bootTime = Date.now();

export function initSwUpdate() {
  if (!('serviceWorker' in navigator)) return;

  // Reload exactly once when the new worker takes control, so every module on
  // the page comes from the new build. This also fires in tabs that didn't
  // trigger the update themselves, keeping all open tabs on the same build.
  // On the very first visit the initial claim must not reload.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    window.location.reload();
  });

  // updateViaCache:'none' makes every update check hit the server for the
  // worker script instead of the HTTP cache.
  navigator.serviceWorker
    .register('/service-worker.js', { updateViaCache: 'none' })
    .then(watchForUpdates)
    .catch(() => {
      /* the SW is progressive enhancement — the app works without it */
    });
}

function watchForUpdates(reg) {
  if (reg.waiting) offerUpdate(reg);

  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // 'installed' with an existing controller means a new build is waiting;
      // without one it's the very first install — nothing to update to.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(reg);
    });
  });

  let lastCheck = Date.now();
  function check() {
    if (!navigator.onLine || Date.now() - lastCheck < CHECK_MIN_GAP_MS) return;
    lastCheck = Date.now();
    reg.update().catch(() => {
      /* offline or server unreachable — retry later */
    });
    // Re-offer an update that was dismissed earlier.
    if (reg.waiting) offerUpdate(reg);
  }
  setInterval(check, CHECK_INTERVAL_MS);
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

function offerUpdate(reg) {
  if (!reg.waiting) return;
  if (Date.now() - bootTime < BOOT_AUTO_MS) {
    activateUpdate(reg);
    return;
  }
  showSnackbar('A new version of Nodecal is ready', {
    actionLabel: 'Update',
    onAction: () => activateUpdate(reg),
    duration: 30000,
  });
}

function activateUpdate(reg) {
  // The reload happens in the controllerchange listener once the worker takes over.
  if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}
