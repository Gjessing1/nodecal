// The task editor lists only visible categories; saving must not drop the rest.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function load(name) {
  return import(pathToFileURL(path.join(__dirname, '..', 'client', 'app', name)).href);
}

test('the task editor keeps the star and hidden categories it does not show', async () => {
  const { withUnshownCategories } = await load('taskUtils.js');
  const original = ['work', 'important', 'secret'];
  assert.deepStrictEqual(withUnshownCategories(original, ['home'], ['secret']), [
    'home',
    'important',
    'secret',
  ]);
  assert.deepStrictEqual(withUnshownCategories(undefined, ['home'], ['secret']), ['home']);
  // A hidden name typed back in by hand is not doubled.
  assert.deepStrictEqual(withUnshownCategories(original, ['secret'], ['secret']), [
    'secret',
    'important',
  ]);
});
