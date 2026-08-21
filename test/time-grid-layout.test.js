const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(
  path.join(__dirname, '..', 'client', 'views', 'timeGridLayout.js'),
).href;

function loadLayout() {
  return import(MODULE_URL);
}

function entry(id, start, end) {
  return {
    ev: { id },
    segment: { start: new Date(start), end: new Date(end) },
  };
}

test('separate events keep the full column and are not conflicts', async () => {
  const { layoutTimeGridSegments } = await loadLayout();
  const laidOut = layoutTimeGridSegments([
    entry('a', '2026-08-21T09:00:00Z', '2026-08-21T10:00:00Z'),
    entry('b', '2026-08-21T10:00:00Z', '2026-08-21T11:00:00Z'),
  ]);
  assert.deepStrictEqual(
    laidOut.map(({ layout }) => layout),
    [
      { lane: 0, columns: 1, conflict: false },
      { lane: 0, columns: 1, conflict: false },
    ],
  );
});

test('overlapping events split into stable lanes and both show a conflict', async () => {
  const { layoutTimeGridSegments } = await loadLayout();
  const laidOut = layoutTimeGridSegments([
    entry('a', '2026-08-21T09:00:00Z', '2026-08-21T11:00:00Z'),
    entry('b', '2026-08-21T10:00:00Z', '2026-08-21T12:00:00Z'),
  ]);
  assert.deepStrictEqual(
    laidOut.map(({ layout }) => layout),
    [
      { lane: 0, columns: 2, conflict: true },
      { lane: 1, columns: 2, conflict: true },
    ],
  );
});

test('a chained conflict keeps one width while reusing a free lane', async () => {
  const { layoutTimeGridSegments } = await loadLayout();
  const laidOut = layoutTimeGridSegments([
    entry('a', '2026-08-21T09:00:00Z', '2026-08-21T10:00:00Z'),
    entry('b', '2026-08-21T09:30:00Z', '2026-08-21T10:30:00Z'),
    entry('c', '2026-08-21T10:00:00Z', '2026-08-21T11:00:00Z'),
  ]);
  assert.deepStrictEqual(
    laidOut.map(({ layout }) => layout),
    [
      { lane: 0, columns: 2, conflict: true },
      { lane: 1, columns: 2, conflict: true },
      { lane: 0, columns: 2, conflict: true },
    ],
  );
});

test('three simultaneous events use three lanes', async () => {
  const { layoutTimeGridSegments } = await loadLayout();
  const laidOut = layoutTimeGridSegments([
    entry('a', '2026-08-21T09:00:00Z', '2026-08-21T11:00:00Z'),
    entry('b', '2026-08-21T09:30:00Z', '2026-08-21T10:30:00Z'),
    entry('c', '2026-08-21T09:45:00Z', '2026-08-21T10:15:00Z'),
  ]);
  assert.deepStrictEqual(
    laidOut.map(({ layout }) => layout.lane),
    [0, 1, 2],
  );
  assert.ok(laidOut.every(({ layout }) => layout.columns === 3 && layout.conflict));
});

test('sorting for layout does not change render order', async () => {
  const { layoutTimeGridSegments } = await loadLayout();
  const laidOut = layoutTimeGridSegments([
    entry('later', '2026-08-21T10:00:00Z', '2026-08-21T12:00:00Z'),
    entry('earlier', '2026-08-21T09:00:00Z', '2026-08-21T11:00:00Z'),
  ]);
  assert.deepStrictEqual(
    laidOut.map(({ ev }) => ev.id),
    ['later', 'earlier'],
  );
  assert.deepStrictEqual(
    laidOut.map(({ layout }) => layout.lane),
    [1, 0],
  );
});
