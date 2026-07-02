const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getBuildInfo, computeBuildInfo } = require('../server/buildInfo');

function makeRoot(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodecal-build-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

test('build id is a 12-char hex hash and is deterministic', () => {
  const a = getBuildInfo();
  const b = computeBuildInfo();
  assert.match(a.buildId, /^[0-9a-f]{12}$/);
  assert.strictEqual(a.buildId, b.buildId);
  assert.deepStrictEqual(a.assets, b.assets);
});

test('asset list covers the real app shell without hand maintenance', () => {
  const { assets } = getBuildInfo();
  assert.ok(assets.includes('/'));
  assert.ok(assets.includes('/manifest.json'));
  assert.ok(assets.includes('/client/app/main.js'));
  assert.ok(assets.includes('/client/app/swUpdate.js'));
  assert.ok(assets.includes('/client/styles/tasks.css'));
  assert.ok(assets.includes('/rrule/rrule.js'));
  // '/' covers index.html, and precaching the worker itself would let update
  // checks read a stale copy back out of the cache.
  assert.ok(!assets.includes('/index.html'));
  assert.ok(!assets.includes('/service-worker.js'));
});

test('build id changes when a served file changes', () => {
  const dir = makeRoot({ 'index.html': '<html>v1</html>', 'app/main.js': 'console.log(1)' });
  const roots = [{ dir, baseUrl: '' }];
  const before = computeBuildInfo(roots);
  fs.writeFileSync(path.join(dir, 'app/main.js'), 'console.log(2)');
  const after = computeBuildInfo(roots);
  assert.notStrictEqual(before.buildId, after.buildId);
  assert.deepStrictEqual(before.assets, after.assets);
});

test('build id changes when a file is added', () => {
  const dir = makeRoot({ 'app/main.js': 'a' });
  const roots = [{ dir, baseUrl: '' }];
  const before = computeBuildInfo(roots);
  fs.writeFileSync(path.join(dir, 'app/new.js'), 'b');
  const after = computeBuildInfo(roots);
  assert.notStrictEqual(before.buildId, after.buildId);
  assert.ok(after.assets.includes('/app/new.js'));
});

test('missing single-file roots are skipped instead of crashing', () => {
  const dir = makeRoot({ 'a.js': 'x' });
  const info = computeBuildInfo([
    { dir, baseUrl: '' },
    { file: path.join(dir, 'does-not-exist.js'), url: '/nope.js' },
  ]);
  assert.deepStrictEqual(info.assets, ['/', '/a.js']);
});
