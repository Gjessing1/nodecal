// Short-lived bottom toast with an optional action button (e.g. Undo).
// Only one snackbar is visible at a time; showing a new one replaces the old.

let current = null;
let hideTimer = null;

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
  el.className = 'snackbar';

  const msg = document.createElement('span');
  msg.className = 'snackbar-msg';
  msg.textContent = message;
  el.appendChild(msg);

  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'snackbar-action';
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
  requestAnimationFrame(() => el.classList.add('snackbar-visible'));
  current = el;
  hideTimer = setTimeout(dismissSnackbar, duration);
}

export function dismissSnackbar() {
  clearTimeout(hideTimer);
  hideTimer = null;
  if (!current) return;
  const el = current;
  current = null;
  el.classList.remove('snackbar-visible');
  setTimeout(() => el.remove(), 200);
}
