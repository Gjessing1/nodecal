let deferredPrompt = null;

/**
 * Wire up install prompt handling.
 * - On browsers that fire beforeinstallprompt: show a bottom banner.
 * - On iOS (which never fires it): show a "share → Add to Home Screen" hint once.
 */
export function initInstallPrompt() {
  // Already installed — nothing to do
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) return;

  const banner = document.getElementById('install-banner');
  const installBtn = document.getElementById('install-btn');
  const dismissBtn = document.getElementById('install-dismiss');
  if (!banner) return;

  const dismissed = localStorage.getItem('install-dismissed');
  if (dismissed) return;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    banner.classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    banner.classList.add('hidden');
    deferredPrompt = null;
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') banner.classList.add('hidden');
      deferredPrompt = null;
    });
  }

  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      banner.classList.add('hidden');
      localStorage.setItem('install-dismissed', '1');
    });
  }

  // iOS: show once a Share-sheet hint since beforeinstallprompt never fires
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIos && !deferredPrompt) {
    setTimeout(() => {
      banner.querySelector('.install-text').textContent = 'Tap  ⎙  then "Add to Home Screen"';
      if (installBtn) installBtn.style.display = 'none';
      banner.classList.remove('hidden');
    }, 3000);
  }
}
