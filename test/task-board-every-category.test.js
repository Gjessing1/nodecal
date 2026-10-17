// A category board set to show each task under every visible category: the
// task gets a card per category, and a move changes only the dragged card.

// Stub env vars so config.js doesn't throw when settings.js is required
process.env.CALDAV_BASEURL = process.env.CALDAV_BASEURL || 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = process.env.CALDAV_USERNAME || 'test';
process.env.CALDAV_PASSWORD = process.env.CALDAV_PASSWORD || 'test';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function load(name) {
  return import(pathToFileURL(path.join(__dirname, '..', 'client', 'app', name)).href);
}

const CTX = {
  today: '2026-09-16',
  hiddenCategories: ['secret'],
  sources: [{ url: 'https://dav/home/', name: 'Home' }],
};

const EVERY = { order: [], labels: {}, hideEmpty: false, everyCategory: true };
const BOARD = { id: 'b', name: 'B', columns: 'category', lanes: '', columnConfig: EVERY };

function task(fields) {
  return {
    id: fields.title,
    title: fields.title,
    status: 'NEEDS-ACTION',
    categories: [],
    ...fields,
  };
}

/** @param {Map<string, Array<{title: string}>>} row */
function titles(row) {
  const out = {};
  for (const [key, tasks] of row) out[key] = tasks.map((t) => t.title);
  return out;
}

test('a task is drawn under each visible category', async () => {
  const { buildBoard } = await load('boardModel.js');
  const tasks = [
    task({ title: 'both', categories: ['secret', 'work', 'errands', 'important'] }),
    task({ title: 'none', categories: ['secret'] }),
  ];
  const layout = buildBoard(tasks, BOARD, CTX);
  assert.deepStrictEqual(titles(layout.cells.get('')), {
    errands: ['both'],
    work: ['both'],
    __none__: ['none'],
  });

  const firstOnly = buildBoard(tasks, { ...BOARD, columnConfig: undefined }, CTX);
  assert.deepStrictEqual(titles(firstOnly.cells.get('')), {
    errands: [],
    work: ['both'],
    __none__: ['none'],
  });
});

test('category lanes can repeat a task too', async () => {
  const { buildBoard } = await load('boardModel.js');
  const board = { id: 'b', name: 'B', columns: 'status', lanes: 'category', laneConfig: EVERY };
  const layout = buildBoard([task({ title: 'x', categories: ['home', 'work'] })], board, CTX);
  assert.deepStrictEqual(titles(layout.cells.get('home')).todo, ['x']);
  assert.deepStrictEqual(titles(layout.cells.get('work')).todo, ['x']);
});

test('hide empty counts every category a task has', async () => {
  const { buildBoard } = await load('boardModel.js');
  const board = { ...BOARD, columnConfig: { ...EVERY, hideEmpty: true } };
  const layout = buildBoard([task({ title: 'x', categories: ['home', 'work'] })], board, CTX);
  assert.deepStrictEqual(
    layout.columns.map((c) => c.key),
    ['home', 'work'],
  );
});

test('a move rewrites the category of the dragged card only', async () => {
  const { dropChanges } = await load('boardMoves.js');
  const t = task({ title: 'x', categories: ['home', 'work', 'important'] });
  assert.deepStrictEqual(dropChanges(BOARD, t, '', 'errands', CTX, { lane: '', column: 'work' }), {
    categories: ['home', 'errands', 'important'],
  });
  assert.deepStrictEqual(dropChanges(BOARD, t, '', 'errands', CTX, { lane: '', column: 'home' }), {
    categories: ['errands', 'work', 'important'],
  });
});

test('a drop onto another category the task already has is refused', async () => {
  const { dropChanges } = await load('boardMoves.js');
  const t = task({ title: 'x', categories: ['home', 'work'] });
  assert.strictEqual(dropChanges(BOARD, t, '', 'home', CTX, { lane: '', column: 'work' }), null);
  assert.deepStrictEqual(dropChanges(BOARD, t, '', 'work', CTX, { lane: '', column: 'work' }), {});
});

test('the move menu marks every category the task is in as current', async () => {
  const { buildBoard } = await load('boardModel.js');
  const { moveGroups } = await load('boardActions.js');
  const t = task({ title: 'x', categories: ['home', 'work'] });
  const other = task({ title: 'y', categories: ['errands'] });
  const layout = buildBoard([t, other], BOARD, CTX);
  const [group] = moveGroups(BOARD, layout, t, CTX, false, { lane: '', column: 'work' });
  assert.deepStrictEqual(
    group.targets.map((target) => [target.label, target.current, target.changes]),
    [
      ['errands', false, { categories: ['home', 'errands'] }],
      ['home', true, {}],
      ['work', true, {}],
      ['Uncategorized', false, { categories: [] }],
    ],
  );
});

test('the order menu works within the card the menu was opened on', async () => {
  const { buildBoard } = await load('boardModel.js');
  const { orderGroup } = await load('boardOrder.js');
  const a = task({ title: 'a', categories: ['home', 'work'], sortOrder: 1 });
  const b = task({ title: 'b', categories: ['work'], sortOrder: 2 });
  const layout = buildBoard([a, b], BOARD, CTX);
  assert.strictEqual(orderGroup(layout, a, { lane: '', column: 'home' }), null);
  const group = orderGroup(layout, a, { lane: '', column: 'work' });
  assert.deepStrictEqual(
    group.targets.map((target) => target.label),
    ['Bottom'],
  );
});

test('the server keeps everyCategory only when it is set', () => {
  const { normalizeTaskBoards } = require('../server/routes/settings.js');
  const [board] = normalizeTaskBoards([
    {
      id: 'b',
      columns: 'category',
      lanes: 'status',
      columnConfig: { order: [], labels: {}, everyCategory: true },
      laneConfig: { order: [], labels: {}, everyCategory: 'yes' },
    },
  ]);
  assert.strictEqual(board.columnConfig.everyCategory, true);
  assert.strictEqual('everyCategory' in board.laneConfig, false);
});
