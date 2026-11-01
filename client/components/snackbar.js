// Short-lived bottom toast with an optional action button (e.g. Undo).
// Only one snackbar is visible at a time; showing a new one replaces the old.

let current = null;
let hideTimer = null;

// Sits just above the bottom nav and slides up into place; the hidden pair of
// classes is swapped for the shown pair so the transition runs both ways.
const SNACKBAR_CLASSES =
  'fixed bottom-[calc(var(--nav-height)+var(--spacing-md)+var(--app-safe-area-bottom))] left-1/2 z-500 flex max-w-[calc(100vw-2*var(--spacing-md))] -translate-x-1/2 items-center gap-md rounded-sm bg-text px-md py-sm text-sm text-bg shadow-snackbar transition-[opacity,translate] duration-200 ease-[ease]';
const HIDDEN_CLASSES = ['translate-y-md', 'opacity-0'];
const SHOWN_CLASSES = ['translate-y-0', 'opacity-100'];

/**
 * Show a snackbar.
 * @param {string} message
 * @param {object} [opts]
 * @param {string}   [opts.actionLabel] - label for the action button (e.g. "Undo")
 * @param {function} [opts.onAction]    - called when the action button is clicked
 * @param {number}   [opts.duration]    - ms before auto-dismiss (default 6000)
 */
export function showSnackbar(message, opts = {}) {
  const { actionLabel, onAction, duration = 6000 } = opts;
  dismissSnackbar();

  const el = document.createElement('div');
  el.className = SNACKBAR_CLASSES;
  el.classList.add(...HIDDEN_CLASSES);

  const msg = document.createElement('span');
  msg.className = 'truncate';
  msg.textContent = message;
  el.appendChild(msg);

  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    // Negative margins grow the tap target without making the bar taller.
    btn.className =
      '-my-xs -mr-sm shrink-0 px-sm py-xs text-sm font-semibold tracking-caps text-accent-light uppercase active:opacity-70';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      const fn = onAction;
      dismissSnackbar();
      fn();
    });
    el.appendChild(btn);
  }

  document.body.appendChild(el);
  // Force a reflow so the entrance transition runs.
  requestAnimationFrame(function showSnackbarEl() {
    el.classList.remove(...HIDDEN_CLASSES);
    el.classList.add(...SHOWN_CLASSES);
  });
  current = el;
  hideTimer = setTimeout(dismissSnackbar, duration);
}

export function dismissSnackbar() {
  clearTimeout(hideTimer);
  hideTimer = null;
  if (!current) return;
  const el = current;
  current = null;
  el.classList.remove(...SHOWN_CLASSES);
  el.classList.add(...HIDDEN_CLASSES);
  setTimeout(() => el.remove(), 200);
}
