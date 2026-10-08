const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

if (process.env.NODECAL_SKIP_DOM_TESTS === '1') {
  test('task view DOM tests need development dependencies', { skip: true }, () => {});
} else {
  const { JSDOM } = require('jsdom');
  let dom;
  let server;
  let state;
  let renderTasks;

  test.before(async () => {
    dom = new JSDOM('<div id="app"><div id="view"></div><div id="bottom-nav"></div></div>', {
      url: 'http://localhost/',
    });
    for (const name of ['window', 'document', 'Event', 'HTMLElement', 'Option', 'localStorage']) {
      globalThis[name] = dom.window[name];
    }
    const { createServer } = await import('vite');
    server = await createServer({
      configFile: false,
      root: path.join(__dirname, '..'),
      server: { middlewareMode: true },
      appType: 'custom',
    });
    ({ state } = await server.ssrLoadModule('/client/app/state.js'));
    ({ renderTasks } = await server.ssrLoadModule('/client/views/tasks.js'));
    state.config.timezone = 'UTC';
    state.config.taskSortOrder = 'due';
    state.taskSources = [
      { url: '/home/', name: 'Home' },
      { url: '/work/', name: 'Work' },
    ];
    state.tasks = [
      {
        id: 'home',
        title: 'Home task',
        status: 'NEEDS-ACTION',
        source: '/home/',
        categories: ['home'],
      },
      {
        id: 'work',
        title: 'Work task',
        status: 'IN-PROCESS',
        source: '/work/',
        categories: ['work'],
      },
    ];
  });

  test.after(async () => {
    await server?.close();
    dom?.window.close();
    for (const name of ['window', 'document', 'Event', 'HTMLElement', 'Option', 'localStorage']) {
      delete globalThis[name];
    }
  });

  test('a Status board remembers Work filters and sort without filtering the list', () => {
    const view = /** @type {HTMLElement} */ (globalThis.document.querySelector('#view'));
    /** @type {any} */
    let added = null;
    /** @type {any} */
    let quickAdded = null;
    renderTasks(view, {
      onBoardAdd: (draft) => (added = draft),
      onAdd: (draft) => (quickAdded = draft),
    });
    const layout = /** @type {HTMLSelectElement} */ (
      view.querySelector('select[aria-label="Layout"]')
    );
    const sort = /** @type {HTMLSelectElement} */ (view.querySelectorAll('.tasks-view select')[1]);

    layout.value = 'board:status';
    layout.dispatchEvent(new Event('change'));
    assert.ok(view.querySelector('.task-board-jump-status'));
    const sourceButtons = /** @type {HTMLButtonElement[]} */ ([
      ...view.querySelectorAll('.tasks-filter-row button'),
    ]);
    sourceButtons.find((button) => button.textContent === 'Work')?.click();
    const categoryButtons = /** @type {HTMLButtonElement[]} */ ([
      ...view.querySelectorAll('.tasks-filter-row button'),
    ]);
    categoryButtons.find((button) => button.textContent === 'work')?.click();
    sort.value = 'manual';
    sort.dispatchEvent(new Event('change'));

    assert.deepEqual(
      [...view.querySelectorAll('.task-card')].map(
        (card) => /** @type {HTMLElement} */ (card).dataset.id,
      ),
      ['work'],
    );
    /** @type {HTMLButtonElement} */ (
      view.querySelector('[aria-label="Add task to In progress"]')
    ).click();
    assert.equal(added.source, '/work/');
    assert.deepEqual(added.categories, ['work']);
    assert.equal(added.status, 'IN-PROCESS');

    const status = /** @type {HTMLSelectElement} */ (
      globalThis.document.querySelector('[aria-label="New task status"]')
    );
    status.value = 'IN-PROCESS';
    status.dispatchEvent(new Event('change'));
    assert.equal(globalThis.document.querySelector('[aria-label="New task (full form)"]'), null);
    const more = /** @type {HTMLButtonElement} */ (
      globalThis.document.querySelector('[aria-label="More task fields"]')
    );
    more.click();
    assert.equal(more.getAttribute('aria-expanded'), 'true');
    /** @type {HTMLSelectElement} */ (
      globalThis.document.querySelector('[aria-label="New task priority"]')
    ).value = 'high';
    /** @type {HTMLSelectElement} */ (
      globalThis.document.querySelector('[aria-label="New task reminder"]')
    ).value = 'on-due';
    /** @type {HTMLTextAreaElement} */ (
      globalThis.document.querySelector('[aria-label="New task notes"]')
    ).value = 'Draft by Friday';
    const quickInput = /** @type {HTMLInputElement} */ (
      globalThis.document.querySelector('#task-quick-add-input')
    );
    quickInput.value = 'Build report';
    /** @type {HTMLButtonElement} */ (
      [...globalThis.document.querySelectorAll('.task-quickadd button')].find(
        (button) => button.textContent === 'Today',
      )
    ).click();
    /** @type {HTMLButtonElement} */ (
      globalThis.document.querySelector('[aria-label="Quick add task"]')
    ).click();
    assert.equal(quickAdded.status, 'IN-PROCESS');
    assert.equal(quickAdded.priority, 1);
    assert.equal(quickAdded.taskReminder, 'on-due');
    assert.equal(quickAdded.description, 'Draft by Friday');
    assert.equal(quickAdded.source, '/work/');
    assert.deepEqual(quickAdded.categories, ['work']);

    layout.value = 'date';
    layout.dispatchEvent(new Event('change'));
    assert.equal(sort.value, 'due');
    assert.equal(view.querySelectorAll('.tasks-list li').length, 2);
    assert.equal(globalThis.document.querySelector('[aria-label="New task status"]'), null);

    layout.value = 'board:status';
    layout.dispatchEvent(new Event('change'));
    assert.equal(sort.value, 'manual');
    assert.equal(
      /** @type {HTMLSelectElement} */ (
        globalThis.document.querySelector('[aria-label="New task status"]')
      ).value,
      'IN-PROCESS',
    );
    assert.deepEqual(
      [...view.querySelectorAll('.task-card')].map(
        (card) => /** @type {HTMLElement} */ (card).dataset.id,
      ),
      ['work'],
    );
    assert.equal(
      view.querySelector('.tasks-filter-row button[aria-pressed="true"]')?.textContent,
      'Work',
    );
  });
}
