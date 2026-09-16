// Kanban board grouping and drop write-backs. client/ is browser ES-module code,
// but the board modules are deliberately DOM-free so they can be imported here.

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
  sources: [
    { url: 'https://dav/home/', name: 'Home' },
    { url: 'https://dav/work/', name: 'Work' },
  ],
};

function task(fields) {
  return {
    id: fields.title,
    title: fields.title,
    status: 'NEEDS-ACTION',
    categories: [],
    ...fields,
  };
}

test('priority levels follow RFC 5545 ranges', async () => {
  const { priorityLevel, priorityRank } = await load('taskUtils.js');
  assert.strictEqual(priorityLevel(0), 'none');
  assert.strictEqual(priorityLevel(undefined), 'none');
  assert.strictEqual(priorityLevel(1), 'high');
  assert.strictEqual(priorityLevel(4), 'high');
  assert.strictEqual(priorityLevel(5), 'medium');
  assert.strictEqual(priorityLevel(6), 'low');
  assert.strictEqual(priorityLevel(9), 'low');
  assert.ok(priorityRank(9) < priorityRank(0), 'undefined sorts after low');
});

test('a status board files tasks by status and keeps only recent done tasks', async () => {
  const { buildBoard } = await load('boardModel.js');
  const board = { id: 'b', name: 'B', columns: 'status', lanes: '' };
  const tasks = [
    task({ title: 'open' }),
    task({ title: 'doing', status: 'IN-PROCESS' }),
    task({ title: 'fresh', status: 'COMPLETED', completed: '2026-09-10T08:00:00Z' }),
    task({ title: 'stale', status: 'COMPLETED', completed: '2026-08-01T08:00:00Z' }),
    task({ title: 'undated', status: 'COMPLETED', completed: null }),
  ];
  const layout = buildBoard(tasks, board, CTX);
  const row = layout.cells.get('');
  assert.deepStrictEqual(
    layout.columns.map((c) => c.key),
    ['todo', 'doing', 'done'],
  );
  assert.deepStrictEqual(
    row.get('todo').map((t) => t.title),
    ['open'],
  );
  assert.deepStrictEqual(
    row.get('doing').map((t) => t.title),
    ['doing'],
  );
  assert.deepStrictEqual(
    row.get('done').map((t) => t.title),
    ['fresh'],
  );
});

test('boards that do not group by status leave completed tasks out', async () => {
  const { buildBoard } = await load('boardModel.js');
  const board = { id: 'b', name: 'B', columns: 'priority', lanes: '' };
  const tasks = [
    task({ title: 'high', priority: 2 }),
    task({ title: 'done', priority: 1, status: 'COMPLETED', completed: '2026-09-15T08:00:00Z' }),
  ];
  const row = buildBoard(tasks, board, CTX).cells.get('');
  assert.deepStrictEqual(
    row.get('high').map((t) => t.title),
    ['high'],
  );
  assert.strictEqual(row.get('none').length, 0);
});

test('swim lanes split every column and keep input order in each cell', async () => {
  const { buildBoard } = await load('boardModel.js');
  const board = { id: 'b', name: 'B', columns: 'status', lanes: 'priority' };
  const tasks = [
    task({ title: 'b', priority: 1 }),
    task({ title: 'a', priority: 1 }),
    task({ title: 'c', priority: 9, status: 'IN-PROCESS' }),
  ];
  const layout = buildBoard(tasks, board, CTX);
  assert.deepStrictEqual(
    layout.lanes.map((l) => l.key),
    ['high', 'medium', 'low', 'none'],
  );
  assert.deepStrictEqual(
    layout.cells
      .get('high')
      .get('todo')
      .map((t) => t.title),
    ['b', 'a'],
  );
  assert.deepStrictEqual(
    layout.cells
      .get('low')
      .get('doing')
      .map((t) => t.title),
    ['c'],
  );
});

test('category buckets list every visible category and file by the first', async () => {
  const { buildBoard } = await load('boardModel.js');
  const board = { id: 'b', name: 'B', columns: 'category', lanes: '' };
  const tasks = [
    task({ title: 'both', categories: ['secret', 'work', 'errands'] }),
    task({ title: 'none', categories: ['important', 'secret'] }),
  ];
  const layout = buildBoard(tasks, board, CTX);
  assert.deepStrictEqual(
    layout.columns.map((c) => c.key),
    ['errands', 'work', '__none__'],
  );
  const row = layout.cells.get('');
  assert.deepStrictEqual(
    row.get('work').map((t) => t.title),
    ['both'],
  );
  assert.strictEqual(row.get('errands').length, 0);
  assert.deepStrictEqual(
    row.get('__none__').map((t) => t.title),
    ['none'],
  );
});

test('due buckets are relative to the configured today', async () => {
  const { bucketKey } = await load('boardBuckets.js');
  assert.strictEqual(bucketKey('due', task({ due: '2026-09-15' }), CTX), 'overdue');
  assert.strictEqual(bucketKey('due', task({ due: '2026-09-16' }), CTX), 'today');
  assert.strictEqual(bucketKey('due', task({ due: '2026-09-17' }), CTX), 'tomorrow');
  assert.strictEqual(bucketKey('due', task({ due: '2026-10-01' }), CTX), 'later');
  assert.strictEqual(bucketKey('due', task({ due: null }), CTX), '__none__');
});

test('status moves write the VTODO status and route Done through completion', async () => {
  const { moveChanges } = await load('boardMoves.js');
  const open = task({ title: 'x' });
  assert.deepStrictEqual(moveChanges('status', open, 'doing', CTX), {
    status: 'IN-PROCESS',
    completed: null,
  });
  assert.deepStrictEqual(moveChanges('status', open, 'done', CTX), { status: 'COMPLETED' });
  assert.deepStrictEqual(moveChanges('status', open, 'todo', CTX), {});
  const done = task({ title: 'y', status: 'COMPLETED', completed: '2026-09-15T08:00:00Z' });
  assert.deepStrictEqual(moveChanges('status', done, 'todo', CTX), {
    status: 'NEEDS-ACTION',
    completed: null,
  });
});

test('priority moves write canonical values and keep in-level values', async () => {
  const { moveChanges } = await load('boardMoves.js');
  assert.deepStrictEqual(moveChanges('priority', task({ title: 'x' }), 'high', CTX), {
    priority: 1,
  });
  assert.deepStrictEqual(
    moveChanges('priority', task({ title: 'x', priority: 3 }), 'high', CTX),
    {},
  );
  assert.deepStrictEqual(moveChanges('priority', task({ title: 'x', priority: 3 }), 'none', CTX), {
    priority: 0,
  });
});

test('category moves swap the filed category and keep hidden ones and the star', async () => {
  const { moveChanges } = await load('boardMoves.js');
  const t = task({ title: 'x', categories: ['secret', 'work', 'errands', 'important'] });
  assert.deepStrictEqual(moveChanges('category', t, 'home', CTX), {
    categories: ['secret', 'home', 'errands', 'important'],
  });
  assert.deepStrictEqual(moveChanges('category', t, 'errands', CTX), {
    categories: ['secret', 'errands', 'important'],
  });
  assert.deepStrictEqual(moveChanges('category', t, '__none__', CTX), {
    categories: ['secret', 'important'],
  });
  const bare = task({ title: 'y', categories: ['important'] });
  assert.deepStrictEqual(moveChanges('category', bare, 'home', CTX), {
    categories: ['home', 'important'],
  });
});

test('ambiguous or unsupported moves are refused', async () => {
  const { moveChanges } = await load('boardMoves.js');
  const t = task({ title: 'x', due: '2026-09-16', source: 'https://dav/home/' });
  assert.strictEqual(moveChanges('due', t, 'later', CTX), null);
  assert.strictEqual(moveChanges('due', t, 'overdue', CTX), null);
  assert.deepStrictEqual(moveChanges('due', t, 'tomorrow', CTX), { due: '2026-09-17' });
  assert.deepStrictEqual(moveChanges('due', t, '__none__', CTX), { due: null });
  assert.strictEqual(moveChanges('source', t, 'https://dav/work/', CTX), null);
  assert.deepStrictEqual(moveChanges('source', t, 'https://dav/home/', CTX), {});
});

test('a diagonal drop combines both axes, lane applied after column', async () => {
  const { dropChanges } = await load('boardMoves.js');
  const board = { id: 'b', name: 'B', columns: 'category', lanes: 'starred' };
  const t = task({ title: 'x', categories: ['work'] });
  assert.deepStrictEqual(dropChanges(board, t, 'starred', 'home', CTX), {
    categories: ['home', 'important'],
  });
  const refusing = { id: 'b', name: 'B', columns: 'status', lanes: 'source' };
  const sourced = task({ title: 'y', source: 'https://dav/home/' });
  assert.strictEqual(dropChanges(refusing, sourced, 'https://dav/work/', 'doing', CTX), null);
});

test('saved boards fall back to the built-in pair when unusable', async () => {
  const { boardsFromConfig, DEFAULT_BOARDS } = await load('boardModel.js');
  assert.strictEqual(boardsFromConfig({}), DEFAULT_BOARDS);
  assert.strictEqual(
    boardsFromConfig({ taskBoards: [{ id: 'x', columns: 'bogus' }] }),
    DEFAULT_BOARDS,
  );
  assert.deepStrictEqual(
    boardsFromConfig({ taskBoards: [{ id: 'x', name: 'X', columns: 'due', lanes: 'due' }] }),
    [{ id: 'x', name: 'X', columns: 'due', lanes: '' }],
  );
});

test('the server keeps only drawable boards', () => {
  const { normalizeTaskBoards } = require('../server/routes/settings.js');
  assert.deepStrictEqual(
    normalizeTaskBoards([
      { id: 'a', name: '  Work  ', columns: 'status', lanes: 'priority' },
      { id: 'a', name: 'dup', columns: 'status', lanes: '' },
      { id: '', name: 'no id', columns: 'status' },
      { id: 'b', name: '', columns: 'nope' },
      { id: 'c', name: '', columns: 'priority', lanes: 'priority' },
    ]),
    [
      { id: 'a', name: 'Work', columns: 'status', lanes: 'priority' },
      { id: 'c', name: 'Board', columns: 'priority', lanes: '' },
    ],
  );
  assert.deepStrictEqual(normalizeTaskBoards('nope'), []);
});

test('VTODO PRIORITY round-trips through the parser', () => {
  const { parseVtodo, serializeTask } = require('../server/caldav/parser.js');
  const ics = serializeTask({ uid: 'u1', title: 'T', status: 'IN-PROCESS', priority: 5 });
  assert.match(ics, /PRIORITY:5\r\n/);
  const [parsed] = parseVtodo(ics);
  assert.strictEqual(parsed.priority, 5);
  assert.strictEqual(parsed.status, 'IN-PROCESS');
  assert.doesNotMatch(serializeTask({ uid: 'u2', title: 'T', priority: 0 }), /PRIORITY/);
  const [junk] = parseVtodo(ics.replace('PRIORITY:5', 'PRIORITY:42'));
  assert.strictEqual(junk.priority, 0);
});
