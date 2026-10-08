const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

if (process.env.NODECAL_SKIP_DOM_TESTS === '1') {
  test('board jump bar DOM tests need development dependencies', { skip: true }, () => {});
} else {
  const { JSDOM } = require('jsdom');
  let dom;
  let server;
  let buildBoardJumpBar;
  let initBoardDnd;

  test.before(async () => {
    dom = new JSDOM('', { url: 'http://localhost/' });
    globalThis.document = dom.window.document;
    globalThis.window = dom.window;
    globalThis.requestAnimationFrame = () => 1;
    globalThis.cancelAnimationFrame = () => {};
    const { createServer } = await import('vite');
    server = await createServer({
      configFile: false,
      root: path.join(__dirname, '..'),
      server: { middlewareMode: true },
      appType: 'custom',
    });
    ({ buildBoardJumpBar } = await server.ssrLoadModule('/client/components/boardJumpBar.js'));
    ({ initBoardDnd } = await server.ssrLoadModule('/client/components/boardDnd.js'));
  });

  test.after(async () => {
    await server?.close();
    dom?.window.close();
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });

  test('column buttons show counts, jump to a column and follow board scrolling', () => {
    const board = globalThis.document.createElement('div');
    const heads = ['To do', 'In progress', 'Done'].map((label, index) => {
      const head = globalThis.document.createElement('div');
      head.textContent = label;
      Object.defineProperties(head, {
        offsetLeft: { value: index * 280 },
        offsetWidth: { value: 272 },
      });
      return head;
    });
    Object.defineProperty(board, 'clientWidth', { value: 412 });
    let requestedLeft = -1;
    Object.defineProperty(board, 'scrollTo', {
      value(options) {
        requestedLeft = options.left;
      },
    });
    const columns = heads.map((head, index) => ({
      head,
      key: ['todo', 'doing', 'done'][index],
      label: head.textContent,
      count: [2, 1, 0][index],
    }));
    const { element, update } = buildBoardJumpBar(board, columns);
    element.scrollTo = () => {};
    const buttons = [...element.querySelectorAll('button')];

    assert.equal(element.getAttribute('aria-label'), 'Board columns');
    assert.deepEqual(
      buttons.map((button) => button.textContent),
      ['To do2', 'In progress1', 'Done0'],
    );
    assert.equal(buttons[2].getAttribute('aria-label'), 'Go to Done column, 0 tasks');
    assert.equal(buttons[2].dataset.column, 'done');
    update();
    assert.equal(buttons[0].getAttribute('aria-current'), 'true');

    buttons[2].click();
    assert.equal(requestedLeft, 560);
    // The browser clamps the final column before its head reaches the left edge.
    board.scrollLeft = 444;
    update();
    assert.equal(buttons[0].hasAttribute('aria-current'), false);
    assert.equal(buttons[2].getAttribute('aria-current'), 'true');
  });

  test('a dragged card can be dropped on a switcher column', () => {
    const board = globalThis.document.createElement('div');
    const cell = globalThis.document.createElement('div');
    cell.className = 'task-board-cell';
    const card = globalThis.document.createElement('div');
    card.className = 'task-card';
    card.dataset.id = 'task-1';
    cell.append(card);
    board.append(cell);
    const jumpBar = globalThis.document.createElement('nav');
    const target = globalThis.document.createElement('button');
    target.className = 'task-board-jump-button';
    target.dataset.column = 'doing';
    jumpBar.append(target);
    globalThis.document.body.append(board, jumpBar);
    globalThis.document.elementFromPoint = () => target;
    const drops = [];
    let allowed = true;
    initBoardDnd(board, {
      ordered: true,
      jumpBar,
      canDropColumn: (_id, key) => allowed && key === 'doing',
      onDropColumn: (id, key) => drops.push([id, key]),
      canDrop: () => false,
      onDrop: () => assert.fail('cell drop was not expected'),
    });

    function pointer(type, x) {
      const event = new dom.window.Event(type, { bubbles: true });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: 'mouse' },
        button: { value: 0 },
        clientX: { value: x },
        clientY: { value: 20 },
      });
      return event;
    }

    card.dispatchEvent(pointer('pointerdown', 10));
    globalThis.window.dispatchEvent(pointer('pointermove', 30));
    assert.equal(target.classList.contains('is-drop-target'), true);
    globalThis.window.dispatchEvent(pointer('pointerup', 30));
    assert.deepEqual(drops, [['task-1', 'doing']]);
    assert.equal(target.classList.contains('is-drop-target'), false);
    assert.equal(globalThis.document.querySelector('.task-card-ghost'), null);
    assert.equal(globalThis.document.querySelector('.task-card-gap'), null);
    allowed = false;
    card.dispatchEvent(pointer('pointerdown', 10));
    globalThis.window.dispatchEvent(pointer('pointermove', 30));
    assert.equal(target.classList.contains('is-drop-blocked'), true);
    globalThis.window.dispatchEvent(pointer('pointerup', 30));
    assert.deepEqual(drops, [['task-1', 'doing']]);
    assert.equal(target.classList.contains('is-drop-blocked'), false);
    board.remove();
    jumpBar.remove();
  });
}
