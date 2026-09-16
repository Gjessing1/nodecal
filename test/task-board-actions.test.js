// Board moves without dragging (the card's "Move to…" menu) and the "+" that
// adds a task straight into a column or lane.

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

async function groupsFor(board, tasks, subject) {
  const { buildBoard } = await load('boardModel.js');
  const { moveGroups } = await load('boardActions.js');
  return moveGroups(board, buildBoard(tasks, board, CTX), subject, CTX);
}

test('a status card can move to every other status column', async () => {
  const board = { id: 'b', name: 'B', columns: 'status', lanes: '' };
  const doing = task({ title: 'doing', status: 'IN-PROCESS' });
  const groups = await groupsFor(board, [doing], doing);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].title, 'Status');
  assert.deepStrictEqual(
    groups[0].targets.map((t) => [t.label, t.current, t.changes]),
    [
      ['To do', false, { status: 'NEEDS-ACTION', completed: null }],
      ['In progress', true, {}],
      ['Done', false, { status: 'COMPLETED' }],
    ],
  );
});

test('the move menu leaves out buckets a drop would refuse', async () => {
  const due = { id: 'b', name: 'B', columns: 'due', lanes: '' };
  const today = task({ title: 'today', due: '2026-09-16' });
  const dueGroups = await groupsFor(due, [today], today);
  assert.deepStrictEqual(
    dueGroups[0].targets.map((t) => t.label),
    ['Today', 'Tomorrow', 'No due date'],
  );

  const source = { id: 's', name: 'S', columns: 'source', lanes: '' };
  const filed = task({ title: 'filed', source: 'https://dav/home/' });
  assert.deepStrictEqual(await groupsFor(source, [filed], filed), [], 'no menu at all');
});

test('a menu move on a laned board changes one axis and keeps the other', async () => {
  const board = { id: 'b', name: 'B', columns: 'status', lanes: 'priority' };
  const urgent = task({ title: 'urgent', priority: 1 });
  const groups = await groupsFor(board, [urgent], urgent);
  assert.deepStrictEqual(
    groups.map((g) => g.title),
    ['Status', 'Priority'],
  );
  const toDoing = groups[0].targets.find((t) => t.label === 'In progress');
  assert.deepStrictEqual(toDoing.changes, { status: 'IN-PROCESS', completed: null });
  const toLow = groups[1].targets.find((t) => t.label === 'Low');
  assert.deepStrictEqual(toLow.changes, { priority: 9 });

  // Source columns cannot be moved between, but the lanes still can.
  const bySource = { id: 's', name: 'S', columns: 'source', lanes: 'priority' };
  const filed = task({ title: 'filed', source: 'https://dav/home/', priority: 1 });
  const sourceGroups = await groupsFor(bySource, [filed], filed);
  assert.deepStrictEqual(
    sourceGroups.map((g) => g.title),
    ['Priority'],
  );
});

test('adding into a bucket prefills what that bucket means', async () => {
  const { bucketDraft } = await load('boardActions.js');
  assert.deepStrictEqual(bucketDraft('status', 'todo', CTX), {});
  assert.deepStrictEqual(bucketDraft('status', 'doing', CTX), { status: 'IN-PROCESS' });
  assert.deepStrictEqual(bucketDraft('priority', 'medium', CTX), { priority: 5 });
  assert.deepStrictEqual(bucketDraft('priority', 'none', CTX), {});
  assert.deepStrictEqual(bucketDraft('due', 'today', CTX), { due: '2026-09-16' });
  assert.deepStrictEqual(bucketDraft('due', 'tomorrow', CTX), { due: '2026-09-17' });
  assert.deepStrictEqual(bucketDraft('due', '__none__', CTX), {});
  assert.deepStrictEqual(bucketDraft('starred', 'starred', CTX), { categories: ['important'] });
  assert.deepStrictEqual(bucketDraft('starred', 'other', CTX), {});
  assert.deepStrictEqual(bucketDraft('category', 'work', CTX), { categories: ['work'] });
  assert.deepStrictEqual(bucketDraft('category', '__none__', CTX), {});
  assert.deepStrictEqual(bucketDraft('source', 'https://dav/work/', CTX), {
    source: 'https://dav/work/',
  });
});

test('buckets without a single meaning for a new task offer no add', async () => {
  const { bucketDraft } = await load('boardActions.js');
  assert.strictEqual(bucketDraft('status', 'done', CTX), null);
  assert.strictEqual(bucketDraft('due', 'overdue', CTX), null);
  assert.strictEqual(bucketDraft('due', 'later', CTX), null);
  assert.strictEqual(bucketDraft('source', '__none__', CTX), null);
});
