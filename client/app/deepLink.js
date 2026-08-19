/**
 * Opening the event or task a native reminder notification was about.
 *
 * The Android shell calls window.nodecalOpen as soon as the page finishes
 * loading, which is normally before /api/events has answered — so a target that
 * is not in state yet is held rather than dropped, and retried each time fresh
 * data lands. It expires so that a target which never arrives (deleted, or
 * outside the synced window) cannot surprise the user with a modal minutes later.
 */
import { state } from './state.js';

const EXPIRY_MS = 30 * 1000;

/** @type {{ kind: string, id: string, at: number } | null} */
let pending = null;
/** @type {{ openEvent: (ev: any) => void, openTask: (task: any) => void } | null} */
let handlers = null;

/**
 * @param {{ openEvent: (ev: any) => void, openTask: (task: any) => void }} onOpen
 */
export function initDeepLink(onOpen) {
  handlers = onOpen;
  /** @type {any} */ (window).nodecalOpen = (kind, id) => {
    if (!id) return;
    pending = { kind, id, at: Date.now() };
    tryOpen();
  };
}

/** Call after events or tasks land in state. */
export function retryDeepLink() {
  tryOpen();
}

function tryOpen() {
  if (!pending || !handlers) return;
  if (Date.now() - pending.at > EXPIRY_MS) {
    pending = null;
    return;
  }

  const { kind, id } = pending;
  if (kind === 'task') {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    pending = null;
    handlers.openTask(task);
    return;
  }

  const event = state.events.find((e) => e.id === id);
  if (!event) return;
  pending = null;
  handlers.openEvent(event);
}
