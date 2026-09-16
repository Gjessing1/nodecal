// Manual task order: the ranking shared with Tasks.org, where a dropped card's
// new order comes from, and how that reaches a board's drops and move menu.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function load(name) {
  return import(pathToFileURL(path.join(__dirname, '..', 'client', 'app', name)).href);
}

const CTX = { today: '2026-09-16', hiddenCategories: [], sources: [] };

function task(title, sortOrder, fields = {}) {
  return { id: title, title, status: 'NEEDS-ACTION', categories: [], sortOrder, ...fields };
}

/** @param {Array<{task: {id: string}, sortOrder: number}>} writes */
function summary(writes) {
  return writes.map((w) => [w.task.id, w.sortOrder]);
}

test('rank is the sort order, else seconds from 2001 to creation as Tasks.org reads it', async () => {
  const { manualRank } = await load('manualOrder.js');
  assert.strictEqual(manualRank(task('a', 42)), 42);
  // (created - 978307200000) / 1000, truncated
  assert.strictEqual(
    manualRank(task('b', null, { createdAt: '2026-09-01T08:00:00.500Z' })),
    Math.trunc((Date.parse('2026-09-01T08:00:00.500Z') - 978307200000) / 1000),
  );
  assert.strictEqual(manualRank(task('c', null)), null);
  assert.strictEqual(manualRank(task('d', null, { createdAt: 'garbage' })), null);
});

test('manual sort puts the lowest rank first and unranked tasks last, in order', async () => {
  const { compareManual } = await load('manualOrder.js');
  const tasks = [task('x', null), task('b', 20), task('y', null), task('a', 10)];
  assert.deepStrictEqual(
    [...tasks].sort(compareManual).map((t) => t.id),
    ['a', 'b', 'x', 'y'],
  );
});

test('a drop between two cards takes the midpoint and writes nothing else', async () => {
  const { placeTask } = await load('manualOrder.js');
  const others = [task('a', 10), task('b', 20), task('c', 30)];
  assert.deepStrictEqual(summary(placeTask(others, task('m', 99), 1)), [['m', 15]]);
  assert.deepStrictEqual(summary(placeTask(others, task('m', 99), 0)), [['m', 9]]);
  assert.deepStrictEqual(summary(placeTask(others, task('m', 1), 3)), [['m', 31]]);
});

test('a card whose rank already fits the gap keeps it', async () => {
  const { placeTask } = await load('manualOrder.js');
  const others = [task('a', 10), task('b', 20)];
  assert.deepStrictEqual(placeTask(others, task('m', 12), 1), []);
  assert.deepStrictEqual(placeTask([], task('m', 12), 0), []);
});

test('with no room, the cards below are pushed down until the order rises again', async () => {
  const { placeTask } = await load('manualOrder.js');
  const others = [task('a', 10), task('b', 11), task('c', 12), task('d', 20)];
  assert.deepStrictEqual(summary(placeTask(others, task('m', 99), 1)), [
    ['m', 11],
    ['b', 12],
    ['c', 13],
  ]);
});

test('ties above the drop are left alone; ties below are separated', async () => {
  const { placeTask } = await load('manualOrder.js');
  const above = [task('a', 10), task('b', 10), task('c', 30)];
  assert.deepStrictEqual(summary(placeTask(above, task('m', 99), 2)), [['m', 20]]);
  const below = [task('a', 10), task('b', 11), task('c', 11)];
  assert.deepStrictEqual(summary(placeTask(below, task('m', 99), 1)), [
    ['m', 11],
    ['b', 12],
    ['c', 13],
  ]);
});

test('unranked tasks get numbered where the move needs them to be', async () => {
  const { placeTask } = await load('manualOrder.js');
  const mixed = [task('a', 10), task('x', null), task('y', null)];
  assert.deepStrictEqual(summary(placeTask(mixed, task('m', null), 2)), [
    ['x', 11],
    ['m', 12],
    ['y', 13],
  ]);
  const unranked = [task('x', null), task('y', null)];
  assert.deepStrictEqual(summary(placeTask(unranked, task('m', null), 0)), [
    ['m', 0],
    ['x', 1],
    ['y', 2],
  ]);
  // Last in the cell with nothing ranked around it: nothing to be relative to.
  assert.deepStrictEqual(placeTask([], task('m', null), 0), []);
});

test('a placed drop folds the moved card’s order into its bucket change', async () => {
  const { placedMove } = await load('boardOrder.js');
  const cell = [task('a', 10), task('b', 11)];
  const moved = task('m', 50, { status: 'IN-PROCESS' });
  assert.deepStrictEqual(placedMove({ status: 'NEEDS-ACTION', completed: null }, moved, cell, 1), {
    changes: { status: 'NEEDS-ACTION', completed: null, sortOrder: 11 },
    shifts: [{ task: cell[1], sortOrder: 12 }],
  });
  // Within its own cell the card is skipped when counting positions.
  const own = [task('a', 10), moved, task('b', 60)];
  assert.deepStrictEqual(placedMove({}, moved, own, 0), {
    changes: { sortOrder: 9 },
    shifts: [],
  });
});

test('an ordered board’s move menu offers top, up, down and bottom within the cell', async () => {
  const { buildBoard } = await load('boardModel.js');
  const { moveGroups } = await load('boardActions.js');
  const board = { id: 'b', name: 'B', columns: 'status', lanes: '' };
  const tasks = [task('a', 10), task('b', 20), task('c', 30), task('d', 40)];
  const layout = buildBoard(tasks, board, CTX);

  function orderLabels(subject) {
    const groups = moveGroups(board, layout, subject, CTX, true);
    const order = groups.find((g) => g.title === 'Order');
    if (!order) return [];
    return order.targets.map((t) => [t.label, t.changes.sortOrder]);
  }

  assert.deepStrictEqual(orderLabels(tasks[0]), [
    ['Down one', 25],
    ['Bottom', 41],
  ]);
  assert.deepStrictEqual(orderLabels(tasks[1]), [
    ['Top', 9],
    ['Down one', 35],
    ['Bottom', 41],
  ]);
  assert.deepStrictEqual(orderLabels(tasks[3]), [
    ['Top', 9],
    ['Up one', 25],
  ]);

  // Only boards drawn in manual order get the group.
  const unordered = moveGroups(board, layout, tasks[1], CTX);
  assert.ok(!unordered.some((g) => g.title === 'Order'));
});
