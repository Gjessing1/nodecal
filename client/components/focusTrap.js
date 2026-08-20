/**
 * Keyboard focus containment for the app's overlays.
 *
 * Every overlay can also be dismissed by the Android hardware back button, and
 * client/app/backNav.js does that by removing the element or adding `hidden` —
 * it never calls a component's close function. So a trap watches its own
 * element and releases itself when the element goes away, rather than trusting
 * the caller to always tell it.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * @typedef {object} Trap
 * @property {HTMLElement} el
 * @property {HTMLElement|null} returnTo
 * @property {(() => void)|null} onEscape
 * @property {MutationObserver} observer
 */

/** Innermost overlay last — only the last entry answers key presses. @type {Trap[]} */
const stack = [];

/**
 * @param {HTMLElement} el
 * @returns {HTMLElement[]}
 */
function focusableWithin(el) {
  /** @type {HTMLElement[]} */
  const found = [];
  for (const node of el.querySelectorAll(FOCUSABLE_SELECTOR)) {
    const candidate = /** @type {HTMLElement} */ (node);
    // getClientRects is empty for display:none, and unlike offsetParent it
    // still reports position:fixed elements.
    if (candidate.getClientRects().length > 0) found.push(candidate);
  }
  return found;
}

/**
 * @param {KeyboardEvent} e
 * @param {Trap} trap
 */
function handleTab(e, trap) {
  const items = focusableWithin(trap.el);
  if (!items.length) {
    e.preventDefault();
    trap.el.focus({ preventScroll: true });
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const outside = !trap.el.contains(active);
  if (e.shiftKey && (outside || active === first)) {
    e.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!e.shiftKey && (outside || active === last)) {
    e.preventDefault();
    first.focus({ preventScroll: true });
  }
}

/** @param {KeyboardEvent} e */
function handleKeydown(e) {
  const trap = stack[stack.length - 1];
  if (!trap) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    if (trap.onEscape) trap.onEscape();
    return;
  }
  if (e.key === 'Tab') handleTab(e, trap);
}

/** @param {Trap} trap */
function pushTrap(trap) {
  // Listens on the bubble phase so a control inside the overlay can consume
  // Escape first (the category autocomplete does) by stopping propagation.
  if (!stack.length) document.addEventListener('keydown', handleKeydown);
  stack.push(trap);
}

/** @param {Trap} trap */
function popTrap(trap) {
  const i = stack.indexOf(trap);
  if (i === -1) return false;
  stack.splice(i, 1);
  if (!stack.length) document.removeEventListener('keydown', handleKeydown);
  return true;
}

/**
 * Mark `el` as a modal dialog, move focus into it and keep Tab inside it.
 *
 * The default initial focus is the dialog itself rather than its first field:
 * on a phone, focusing a text input pops the on-screen keyboard, which the
 * touch flows here deliberately avoid. Pass `initialFocus` when a field really
 * should be typed into straight away.
 *
 * @param {HTMLElement} el - the element focus is confined to
 * @param {object} [opts]
 * @param {HTMLElement} [opts.watchEl] - element whose removal or `hidden` class
 *   means the dialog closed; defaults to `el`
 * @param {HTMLElement} [opts.initialFocus]
 * @param {() => void} [opts.onEscape]
 * @param {string} [opts.label] - accessible name for the dialog
 * @returns {() => void} release - idempotent; restores focus to the opener
 */
export function trapFocus(el, opts = {}) {
  const watchEl = opts.watchEl || el;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  if (opts.label) el.setAttribute('aria-label', opts.label);
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');

  const active = document.activeElement;
  /** @type {Trap} */
  const trap = {
    el,
    returnTo: active instanceof HTMLElement ? active : null,
    onEscape: opts.onEscape || null,
    observer: new MutationObserver(checkClosed),
  };

  function checkClosed() {
    if (watchEl.isConnected && !watchEl.classList.contains('hidden')) return;
    release();
  }

  function release() {
    if (!popTrap(trap)) return;
    trap.observer.disconnect();
    const focused = document.activeElement;
    const strayed = focused !== document.body && !el.contains(focused);
    if (trap.returnTo && trap.returnTo.isConnected && !strayed) {
      trap.returnTo.focus({ preventScroll: true });
    }
  }

  pushTrap(trap);
  trap.observer.observe(watchEl, { attributes: true, attributeFilter: ['class'] });
  if (watchEl.parentNode) trap.observer.observe(watchEl.parentNode, { childList: true });

  const target = opts.initialFocus || el;
  target.focus({ preventScroll: true });
  return release;
}
