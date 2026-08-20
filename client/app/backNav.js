/**
 * One place that decides what a back gesture does inside the app. Both the
 * browser popstate handler and the Android hardware back button route through
 * goBack(), so a press behaves the same in the PWA and in the native shell.
 */

import { settingsBack } from '../components/settingsPanel.js';
import { closeDaySheet } from '../views/daySheet.js';

/** Overlays built on demand and removed from the DOM when dismissed. */
const POPOVER_IDS = ['time-picker-overlay', 'mini-cal-overlay', 'month-day-popup'];

/** Overlays that live in index.html and are toggled with the `hidden` class. */
const SHEET_IDS = ['modal-overlay', 'settings-overlay', 'search-overlay', 'cal-drawer-overlay'];

/** @type {(() => boolean) | null} */
let restorePreviousView = null;

/**
 * @param {() => boolean} onPreviousView - restore the previously active view;
 *   returns false when there is no earlier view to return to.
 */
export function initBackNav(onPreviousView) {
  restorePreviousView = onPreviousView;
  // The Android shell asks the page whether it consumed the hardware back
  // press before it finishes the activity.
  /** @type {any} */ (window).nodecalBack = goBack;
}

/**
 * Dismiss the topmost layer of UI.
 * @returns {boolean} true when a layer was dismissed and the caller should
 *   swallow the gesture; false when the app is already at its root.
 */
export function goBack() {
  // The login overlay is a gate, not a layer — back must never dismiss it.
  const login = document.getElementById('login-overlay');
  if (login && !login.classList.contains('hidden')) return false;

  for (const id of POPOVER_IDS) {
    const popover = document.getElementById(id);
    if (popover) {
      popover.remove();
      return true;
    }
  }

  // Settings drills into one section at a time; back leaves the section before
  // it leaves Settings.
  if (settingsBack()) return true;

  // Hiding the overlay is all the components' own close functions do, and the
  // event and task editors share #modal-overlay, so close by element here.
  for (const id of SHEET_IDS) {
    const sheet = document.getElementById(id);
    if (sheet && !sheet.classList.contains('hidden')) {
      sheet.classList.add('hidden');
      return true;
    }
  }

  // The month view's day sheet is part of the view rather than an overlay, so it
  // comes after every real overlay: closing it drops the selection and lets the
  // grid expand again.
  if (closeDaySheet()) return true;

  if (restorePreviousView) return restorePreviousView();
  return false;
}
