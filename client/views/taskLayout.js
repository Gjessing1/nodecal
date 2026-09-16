import { state } from '../app/state.js';
import { boardsFromConfig } from '../app/boardModel.js';

// The Tasks view's layout menu picks one of the list groupings ('date', shown
// as Agenda, or 'category') or a kanban board ('board:<id>').

// The one view choice kept across launches: someone who works from a board
// should not land back in the list every time the app opens.
const LAYOUT_STORAGE_KEY = 'nodecal-tasks-layout';
const BOARD_PREFIX = 'board:';

/**
 * Layout select: the two list groupings, then every board. Each option names
 * its kind ("Group:", "Kanban:") the way the sort menu says "Sort:", so the
 * closed select reads on its own and the list needs no section headings.
 * Rebuilt each render so a board added or renamed in Settings shows up without
 * a reload.
 * @returns {HTMLSelectElement}
 */
export function buildLayoutSelect() {
  const select = document.createElement('select');
  select.className = 'rounded-sm px-sm py-xs text-sm';
  select.setAttribute('aria-label', 'Layout');
  // 'date' stays the stored value so a layout remembered before the rename still loads.
  select.append(new Option('Group: Agenda', 'date'), new Option('Group: Category', 'category'));
  for (const board of boardsFromConfig(state.config)) {
    select.appendChild(new Option(`Kanban: ${board.name}`, BOARD_PREFIX + board.id));
  }
  return select;
}

/**
 * The board a layout value names, or null for the list groupings.
 * @param {string} layout
 * @returns {import('../app/boardBuckets.js').TaskBoard|null}
 */
export function boardForLayout(layout) {
  if (!layout.startsWith(BOARD_PREFIX)) return null;
  const id = layout.slice(BOARD_PREFIX.length);
  for (const board of boardsFromConfig(state.config)) {
    if (board.id === id) return board;
  }
  return null;
}

/** @returns {string} */
export function readStoredLayout() {
  try {
    return localStorage.getItem(LAYOUT_STORAGE_KEY) || 'date';
  } catch {
    return 'date';
  }
}

/** @param {string} layout */
export function storeLayout(layout) {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  } catch {
    // Private mode or blocked storage: the choice just lasts this session.
  }
}
