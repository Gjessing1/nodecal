/**
 * Parse #tag tokens from a task title string.
 * Tags are lowercased and stripped from the title before saving.
 * @param {string} raw
 * @returns {{ title: string, tags: string[] }}
 */
export function parseTagsFromTitle(raw) {
  const tags = [];
  const cleaned = raw.replace(/#(\S+)/g, (_, tag) => {
    tags.push(tag.toLowerCase());
    return '';
  }).replace(/\s+/g, ' ').trim();
  return { title: cleaned, tags };
}

/**
 * Get all unique category names across tasks, excluding 'important'.
 * @param {Array} tasks
 * @returns {string[]} sorted
 */
export function getAllCategories(tasks) {
  const cats = new Set();
  for (const t of tasks) {
    for (const c of (t.categories || [])) {
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
  return (cats || []).filter(c => c !== 'important' && !hiddenCategories.includes(c));
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
  for (const k of [...groups.keys()].filter(k => k).sort()) sorted.set(k, groups.get(k));
  if (groups.has('')) sorted.set('', groups.get(''));
  return sorted;
}
