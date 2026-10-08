import { NO_VALUE, bucketKey } from './boardBuckets.js';

/**
 * Pinned buckets lead, while new values still appear in their natural order.
 * Hide only unpinned buckets with no visible cards so a saved preference cannot
 * conceal an occupied bucket when task data changes.
 * @param {import('./boardBuckets.js').BoardBucket[]} buckets
 * @param {import('./boardBuckets.js').BoardAxisConfig|undefined} config
 * @param {import('./state.js').Task[]} shown
 * @param {import('./boardBuckets.js').BoardField} field
 * @param {import('./boardBuckets.js').BoardContext} ctx
 */
export function configuredBuckets(buckets, config, shown, field, ctx) {
  if (!config) return buckets;
  const order = Array.isArray(config.order) ? config.order : [];
  const labels = config.labels || {};
  if (field === 'category') {
    const known = new Set(buckets.map((bucket) => bucket.key));
    for (const key of order) {
      if (key === NO_VALUE || known.has(key) || ctx.hiddenCategories.includes(key)) continue;
      buckets.push({ key, label: key });
      known.add(key);
    }
  }
  const counts = new Map();
  for (const task of shown) {
    const key = bucketKey(field, task, ctx);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const ranked = new Map();
  for (let i = 0; i < order.length; i++) ranked.set(order[i], i);
  const result = [];
  for (const bucket of buckets) {
    if (config.hideEmpty && !counts.get(bucket.key) && !ranked.has(bucket.key)) continue;
    const label = typeof labels[bucket.key] === 'string' && labels[bucket.key].trim();
    result.push({ key: bucket.key, label: label || bucket.label });
  }
  result.sort((a, b) => {
    const left = ranked.has(a.key) ? ranked.get(a.key) : Infinity;
    const right = ranked.has(b.key) ? ranked.get(b.key) : Infinity;
    return left - right;
  });
  // Keep one target for a new task when every bucket is currently empty.
  if (!result.length && buckets.length) {
    const first = buckets.find((bucket) => bucket.key === order[0]) || buckets[0];
    result.push({ key: first.key, label: labels[first.key] || first.label });
  }
  return result;
}
