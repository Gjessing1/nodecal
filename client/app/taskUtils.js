/**
 * Parse #tag tokens from a task title string.
 * Tags are lowercased and stripped from the title before saving.
 * @param {string} raw
 * @returns {{ title: string, tags: string[] }}
 */
export function parseTagsFromTitle(raw) {
  const tags = [];
  const cleaned = raw
    .replace(/#(\S+)/g, (_, tag) => {
      tags.push(tag.toLowerCase());
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { title: cleaned, tags };
}

/**
 * Whether a task's source calendar is currently visible (not hidden via the
 * drawer or active profile). Tasks without a source are always visible.
 * @param {object} task
 * @param {Set<string>} hiddenCalendars - source URLs currently hidden
 * @returns {boolean}
 */
export function taskSourceVisible(task, hiddenCalendars) {
  return !task.source || !hiddenCalendars.has(task.source);
}

/**
 * Get all unique category names across tasks, excluding 'important'.
 * @param {Array} tasks
 * @returns {string[]} sorted
 */
export function getAllCategories(tasks) {
  const cats = new Set();
  for (const t of tasks) {
    for (const c of t.categories || []) {
      if (c !== 'important') cats.add(c);
    }
  }
  return [...cats].sort();
}

/**
 * Filter a category list to those that are not hidden and not 'important'.
 * @param {string[]} cats
 * @param {string[]} hiddenCategories
 * @returns {string[]}
 */
export function visibleCategories(cats, hiddenCategories = []) {
  return (cats || []).filter((c) => c !== 'important' && !hiddenCategories.includes(c));
}

/**
 * Group tasks by their first visible category.
 * Tasks with no visible category are keyed under '' (uncategorized).
 * @param {Array} tasks
 * @param {string[]} hiddenCategories
 * @returns {Map<string, Array>} ordered: named categories alphabetically, then ''
 */
export function groupTasksByCategory(tasks, hiddenCategories = []) {
  const groups = new Map();
  for (const task of tasks) {
    const cats = visibleCategories(task.categories || [], hiddenCategories);
    const key = cats[0] || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  // Sort: named categories first (alpha), uncategorized last
  const sorted = new Map();
  for (const k of [...groups.keys()].filter((k) => k).sort()) sorted.set(k, groups.get(k));
  if (groups.has('')) sorted.set('', groups.get(''));
  return sorted;
}

/**
 * The PRIORITY Nodecal writes for each level — the 1/5/9 convention Apple
 * Reminders and Thunderbird use, so a level set here reads the same there.
 */
export const PRIORITY_VALUES = { high: 1, medium: 5, low: 9, none: 0 };

/** Display order and names for the priority levels, highest first. */
export const PRIORITY_LEVELS = [
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
  { key: 'none', label: 'None' },
];

/**
 * The three-level reading of an RFC 5545 PRIORITY: 1–4 high, 5 medium, 6–9 low,
 * 0 or missing undefined. Other clients write the in-between values.
 * @param {number|null|undefined} priority
 * @returns {'high'|'medium'|'low'|'none'}
 */
export function priorityLevel(priority) {
  if (!priority || priority < 1 || priority > 9) return 'none';
  if (priority <= 4) return 'high';
  if (priority === 5) return 'medium';
  return 'low';
}

/**
 * Sort rank for a priority: high first, undefined last. Raw PRIORITY cannot be
 * compared directly because 0 means "none", not "above 1".
 * @param {number|null|undefined} priority
 * @returns {number}
 */
export function priorityRank(priority) {
  if (!priority || priority < 1 || priority > 9) return 10;
  return priority;
}

/**
 * The categories to save from the task editor, which only lists the visible
 * ones: the edited list plus what the editor kept out of sight — the
 * 'important' star and hidden categories. Without this, saving a task from
 * the editor unstars it and strips categories hidden in Settings.
 * @param {string[]|undefined} original - the task's categories before editing
 * @param {string[]} edited - the categories the editor ended with
 * @param {string[]} hiddenCategories
 * @returns {string[]}
 */
export function withUnshownCategories(original, edited, hiddenCategories = []) {
  const result = [...edited];
  for (const cat of original || []) {
    if (visibleCategories([cat], hiddenCategories).length) continue;
    if (!result.includes(cat)) result.push(cat);
  }
  return result;
}
