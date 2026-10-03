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

  test.before(async () => {
    dom = new JSDOM('', { url: 'http://localhost/' });
    globalThis.document = dom.window.document;
    const { createServer } = await import('vite');
    server = await createServer({
      configFile: false,
      root: path.join(__dirname, '..'),
      server: { middlewareMode: true },
      appType: 'custom',
    });
    ({ buildBoardJumpBar } = await server.ssrLoadModule('/client/components/boardJumpBar.js'));
  });

  test.after(async () => {
    await server?.close();
    dom?.window.close();
    delete globalThis.document;
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
}
