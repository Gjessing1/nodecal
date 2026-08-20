import { trapFocus } from './focusTrap.js';

/**
 * The popover shell shared by the date, month/year and time pickers: a
 * full-screen backdrop plus a centred panel. Tapping the backdrop closes it,
 * and while it is open focus stays inside the panel and Escape closes it.
 *
 * @param {{ id: string, label: string, panelClass?: string }} opts
 * @returns {{ overlay: HTMLElement, panel: HTMLElement, close: () => void,
 *   mount: (initialFocus?: HTMLElement) => void }}
 */
export function createPickerOverlay({ id, label, panelClass = '' }) {
  document.getElementById(id)?.remove();

  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.className = 'mini-cal-overlay';

  const panel = document.createElement('div');
  panel.className = panelClass ? `mini-cal-panel ${panelClass}` : 'mini-cal-panel';

  /** @param {Event} e */
  function stopPanelClick(e) {
    e.stopPropagation();
  }

  function close() {
    overlay.remove();
  }

  /** @param {Event} e */
  function onBackdropClick(e) {
    if (e.target === overlay) close();
  }

  /**
   * Attach to the DOM and take focus. Called after the panel's contents are
   * built so the trap can see what is focusable.
   * @param {HTMLElement} [initialFocus]
   */
  function mount(initialFocus) {
    document.getElementById('app')?.appendChild(overlay);
    trapFocus(panel, { watchEl: overlay, label, initialFocus, onEscape: close });
  }

  panel.addEventListener('click', stopPanelClick);
  overlay.addEventListener('click', onBackdropClick);
  overlay.appendChild(panel);

  return { overlay, panel, close, mount };
}
