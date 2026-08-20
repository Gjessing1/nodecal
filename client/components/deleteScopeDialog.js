import { trapFocus } from './focusTrap.js';

const CHOICES = [
  ['single', 'This event only'],
  ['future', 'This and following events'],
  ['all', 'Entire series'],
];

/**
 * Ask which occurrences of a recurring event to delete.
 * Resolves with 'single' | 'future' | 'all', or null if cancelled.
 * @returns {Promise<string|null>}
 */
export function showDeleteScopeDialog() {
  return new Promise(function run(resolve) {
    const dlgOverlay = document.createElement('div');
    dlgOverlay.className = 'modal-overlay delete-scope-overlay';

    const box = document.createElement('div');
    box.className = 'modal-sheet delete-scope-sheet';

    const title = document.createElement('div');
    title.className = 'modal-title';
    title.id = 'delete-scope-title';
    title.textContent = 'Delete recurring event';

    /** @type {(() => void)|null} */
    let release = null;

    /** @param {string|null} value */
    function finish(value) {
      if (release) release();
      dlgOverlay.remove();
      resolve(value);
    }

    function cancel() {
      finish(null);
    }

    box.appendChild(title);
    /** @type {HTMLButtonElement|null} */
    let firstChoice = null;
    for (const [value, label] of CHOICES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-danger delete-scope-btn';
      btn.textContent = label;
      btn.addEventListener('click', function choose() {
        finish(value);
      });
      box.appendChild(btn);
      if (!firstChoice) firstChoice = btn;
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost delete-scope-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', cancel);
    box.appendChild(cancelBtn);

    dlgOverlay.addEventListener('click', function onBackdrop(e) {
      if (e.target === dlgOverlay) cancel();
    });
    dlgOverlay.appendChild(box);
    document.body.appendChild(dlgOverlay);

    // Sits on top of the still-open event modal, so it takes the focus trap
    // from it until one of the choices resolves the promise.
    release = trapFocus(box, {
      watchEl: dlgOverlay,
      initialFocus: firstChoice || cancelBtn,
      onEscape: cancel,
    });
    box.setAttribute('aria-labelledby', title.id);
  });
}
