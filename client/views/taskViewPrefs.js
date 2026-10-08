// The list has one set of controls; each kanban board remembers its own.
// Keep these view choices on this device, alongside the remembered layout.
const STORAGE_KEY = 'nodecal-task-view-prefs';
const SORT_ORDERS = new Set(['due', 'starred', 'priority', 'alpha', 'created', 'manual']);
/** @type {Record<string, any>|null} */
let cache = null;

/** @typedef {{filterCat: string, filterSource: string, starredOnly: boolean, sortOrder: string|null}} TaskViewPrefs */

/** @param {string} layout */
function preferenceKey(layout) {
  return layout.startsWith('board:') ? layout : 'list';
}

/** @returns {Record<string, any>} */
function readSaved() {
  if (cache) return cache;
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    cache = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    cache = {};
  }
  return cache;
}

/**
 * @param {string} layout
 * @returns {TaskViewPrefs}
 */
export function readTaskViewPrefs(layout) {
  const saved = readSaved()[preferenceKey(layout)] || {};
  return {
    filterCat: typeof saved.filterCat === 'string' ? saved.filterCat : '',
    filterSource: typeof saved.filterSource === 'string' ? saved.filterSource : '',
    starredOnly: saved.starredOnly === true,
    sortOrder: SORT_ORDERS.has(saved.sortOrder) ? saved.sortOrder : null,
  };
}

/**
 * @param {string} layout
 * @param {TaskViewPrefs} prefs
 */
export function storeTaskViewPrefs(layout, prefs) {
  try {
    const saved = readSaved();
    saved[preferenceKey(layout)] = prefs;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Private mode or blocked storage: the cache still lasts this session.
  }
}
