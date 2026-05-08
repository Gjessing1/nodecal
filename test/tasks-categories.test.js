const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Pure functions mirrored from client/app/taskUtils.js
function parseTagsFromTitle(raw) {
  const tags = [];
  const cleaned = raw.replace(/#(\S+)/g, (_, tag) => {
    tags.push(tag.toLowerCase());
    return '';
  }).replace(/\s+/g, ' ').trim();
  return { title: cleaned, tags };
}

function visibleCategories(cats, hiddenCategories = []) {
  return (cats || []).filter(c => c !== 'important' && !hiddenCategories.includes(c));
}

function getAllCategories(tasks) {
  const cats = new Set();
  for (const t of tasks) {
    for (const c of (t.categories || [])) {
      if (c !== 'important') cats.add(c);
    }
  }
  return [...cats].sort();
}

function groupTasksByCategory(tasks, hiddenCategories = []) {
  const groups = new Map();
  for (const task of tasks) {
    const cats = visibleCategories(task.categories || [], hiddenCategories);
    const key = cats[0] || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(task);
  }
  const sorted = new Map();
  for (const k of [...groups.keys()].filter(k => k).sort()) sorted.set(k, groups.get(k));
  if (groups.has('')) sorted.set('', groups.get(''));
  return sorted;
}

// ── #tag parsing ───────────────────────────────────────────

describe('parseTagsFromTitle', () => {
  it('extracts a single tag', () => {
    const r = parseTagsFromTitle('Buy milk #groceries');
    assert.equal(r.title, 'Buy milk');
    assert.deepEqual(r.tags, ['groceries']);
  });

  it('extracts multiple tags', () => {
    const r = parseTagsFromTitle('Call dentist #health #urgent');
    assert.equal(r.title, 'Call dentist');
    assert.deepEqual(r.tags, ['health', 'urgent']);
  });

  it('lowercases tags', () => {
    const r = parseTagsFromTitle('Do thing #Work #IMPORTANT');
    assert.deepEqual(r.tags, ['work', 'important']);
  });

  it('strips tags mid-title', () => {
    const r = parseTagsFromTitle('Buy #groceries milk');
    assert.equal(r.title, 'Buy milk');
    assert.deepEqual(r.tags, ['groceries']);
  });

  it('title without tags passes through unchanged', () => {
    const r = parseTagsFromTitle('No tags here');
    assert.equal(r.title, 'No tags here');
    assert.deepEqual(r.tags, []);
  });

  it('title that is only a tag leaves empty title', () => {
    const r = parseTagsFromTitle('#work');
    assert.equal(r.title, '');
    assert.deepEqual(r.tags, ['work']);
  });
});

// ── Hidden category filtering ──────────────────────────────

describe('visibleCategories', () => {
  it('excludes important', () => {
    const r = visibleCategories(['work', 'important', 'personal'], []);
    assert.deepEqual(r, ['work', 'personal']);
  });

  it('excludes hidden categories', () => {
    const r = visibleCategories(['work', 'personal', 'errands'], ['personal']);
    assert.deepEqual(r, ['work', 'errands']);
  });

  it('excludes both important and hidden', () => {
    const r = visibleCategories(['work', 'important', 'personal'], ['work']);
    assert.deepEqual(r, ['personal']);
  });

  it('returns empty for null input', () => {
    assert.deepEqual(visibleCategories(null, []), []);
  });
});

describe('getAllCategories', () => {
  const tasks = [
    { categories: ['work', 'important'] },
    { categories: ['personal', 'work'] },
    { categories: [] },
    { categories: null },
  ];

  it('collects unique categories, sorted, excluding important', () => {
    const r = getAllCategories(tasks);
    assert.deepEqual(r, ['personal', 'work']);
  });

  it('returns empty for tasks with no categories', () => {
    assert.deepEqual(getAllCategories([{ categories: [] }]), []);
  });
});

// ── Group by category ──────────────────────────────────────

describe('groupTasksByCategory', () => {
  const tasks = [
    { id: 1, title: 'A', categories: ['work'] },
    { id: 2, title: 'B', categories: ['personal'] },
    { id: 3, title: 'C', categories: ['work', 'personal'] },
    { id: 4, title: 'D', categories: [] },
    { id: 5, title: 'E', categories: ['important'] },
  ];

  it('groups by first visible category', () => {
    const groups = groupTasksByCategory(tasks, []);
    assert.deepEqual([...groups.keys()], ['personal', 'work', '']);
    assert.equal(groups.get('work').length, 2);
    assert.equal(groups.get('personal').length, 1);
  });

  it('places tasks with no visible category under empty key', () => {
    const groups = groupTasksByCategory(tasks, []);
    const nocat = groups.get('');
    assert.ok(nocat.some(t => t.id === 4));
    assert.ok(nocat.some(t => t.id === 5));
  });

  it('treats hidden categories as invisible', () => {
    const groups = groupTasksByCategory(tasks, ['work']);
    assert.ok(!groups.has('work'));
    const nocat = groups.get('');
    assert.ok(nocat.some(t => t.id === 1));
  });

  it('named categories come before uncategorized', () => {
    const groups = groupTasksByCategory(tasks, []);
    const keys = [...groups.keys()];
    const uncatIdx = keys.indexOf('');
    for (let i = 0; i < uncatIdx; i++) {
      assert.ok(keys[i] !== '');
    }
  });
});
