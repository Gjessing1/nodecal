const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

if (process.env.NODECAL_SKIP_DOM_TESTS === '1') {
  test('list drag needs development dependencies', { skip: true }, () => {});
} else {
  const { JSDOM } = require('jsdom');

  test('a handle drag reorders only inside its list section', async () => {
    const dom = new JSDOM(`
      <div id="list">
        <ul class="task-list-group">
          <li data-id="a"><button class="task-list-move"></button></li>
          <li data-id="b"><button class="task-list-move"></button></li>
          <li data-id="c"><button class="task-list-move"></button></li>
        </ul>
        <ul class="task-list-group"><li data-id="d"><button class="task-list-move"></button></li></ul>
      </div>
    `);
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    globalThis.cancelAnimationFrame = (timer) => clearTimeout(timer);
    const list = /** @type {HTMLElement} */ (globalThis.document.querySelector('#list'));
    const sections = [...list.querySelectorAll('.task-list-group')];
    list.scrollBy = () => {};
    list.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, 200, 200);
    for (const [index, item] of [...sections[0].querySelectorAll('li')].entries()) {
      item.getBoundingClientRect = () => new dom.window.DOMRect(0, index * 40, 200, 40);
    }
    sections[1].querySelector('li').getBoundingClientRect = () =>
      new dom.window.DOMRect(0, 160, 200, 40);
    globalThis.document.elementFromPoint = (_x, y) =>
      y > 150 ? sections[1].querySelector('li') : sections[0].querySelector('li');

    const { initListDnd, clearListDnd } = await import(
      pathToFileURL(path.join(__dirname, '..', 'client', 'components', 'listDnd.js')).href
    );
    const drops = [];
    initListDnd(list, (id, section, index) => drops.push([id, section, index]));
    const handle = sections[0].querySelector('li[data-id="c"] button');
    function pointer(type, target, y) {
      const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        clientX: 20,
        clientY: y,
      });
      target.dispatchEvent(event);
    }

    pointer('pointerdown', handle, 100);
    pointer('pointermove', globalThis.window, 5);
    pointer('pointerup', globalThis.window, 5);
    assert.deepEqual(drops, [['c', sections[0], 0]]);
    assert.equal(globalThis.document.querySelector('.task-list-ghost'), null);

    pointer('pointerdown', handle, 100);
    pointer('pointermove', globalThis.window, 180);
    pointer('pointerup', globalThis.window, 180);
    assert.equal(drops.length, 1, 'another section is not a reorder target');
    clearListDnd(list);
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });
}
