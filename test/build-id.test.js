const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getBuildId } = require('../server/buildId');

function makeWorker(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodecal-build-id-'));
  const worker = path.join(dir, 'service-worker.js');
  fs.writeFileSync(worker, content);
  return worker;
}

test('build id is a 12-char deterministic content hash', () => {
  const worker = makeWorker('precache([{url:"app.js",revision:"abc"}])');
  const a = getBuildId(worker);
  const b = getBuildId(worker);
  assert.match(a, /^[0-9a-f]{12}$/);
  assert.strictEqual(a, b);
});

test('build id changes when Workbox output changes', () => {
  const before = getBuildId(makeWorker('revision one'));
  const after = getBuildId(makeWorker('revision two'));
  assert.notStrictEqual(before, after);
});
