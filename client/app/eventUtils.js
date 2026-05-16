/**
 * Get all unique category names across events.
 * @param {Array} events - state.events
 * @returns {string[]} sorted
 */
export function getAllEventCategories(events) {
  const cats = new Set();
  for (const ev of events) {
    for (const c of (ev.categories || [])) cats.add(c);
  }
  return [...cats].sort();
}
