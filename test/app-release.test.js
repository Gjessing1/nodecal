const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { readPublishedApp, registerAppReleaseRoutes } = require('../server/appRelease');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nodecal-app-release-'));
}

test('reads a valid published Android release', async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = 'nodecal-0.2.0.apk';
  fs.writeFileSync(path.join(dir, file), 'apk bytes');
  fs.writeFileSync(
    path.join(dir, 'version.json'),
    JSON.stringify({
      versionCode: 2,
      versionName: '0.2.0',
      file,
      sha256: 'a'.repeat(64),
    }),
  );

  const published = await readPublishedApp(dir);
  assert.strictEqual(published.versionCode, 2);
  assert.strictEqual(published.versionName, '0.2.0');
  assert.strictEqual(published.bytes, 9);
  assert.strictEqual(published.apkPath, path.join(dir, file));
});

test('rejects path traversal in Android release metadata', async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, 'version.json'),
    JSON.stringify({
      versionCode: 2,
      versionName: '0.2.0',
      file: '../nodecal-0.2.0.apk',
      sha256: 'a'.repeat(64),
    }),
  );

  await assert.rejects(() => readPublishedApp(dir), /invalid APK filename/);
});

test('rejects malformed Android release metadata', async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'version.json'), '{}');
  await assert.rejects(() => readPublishedApp(dir), /invalid versionCode/);
});

test('serves release metadata and the current APK', async (t) => {
  const dir = tempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = 'nodecal-0.2.0.apk';
  fs.writeFileSync(path.join(dir, file), 'signed apk');
  fs.writeFileSync(
    path.join(dir, 'version.json'),
    JSON.stringify({
      versionCode: 2,
      versionName: '0.2.0',
      file,
      sha256: 'b'.repeat(64),
    }),
  );

  const app = express();
  registerAppReleaseRoutes(app, dir);
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const versionResponse = await fetch(`http://127.0.0.1:${port}/api/app/version`);
  assert.strictEqual(versionResponse.status, 200);
  assert.deepStrictEqual(await versionResponse.json(), {
    versionCode: 2,
    versionName: '0.2.0',
    sha256: 'b'.repeat(64),
    bytes: 10,
    apkUrl: '/api/app/download',
  });

  const downloadResponse = await fetch(`http://127.0.0.1:${port}/api/app/download`);
  assert.strictEqual(downloadResponse.status, 200);
  assert.match(downloadResponse.headers.get('content-disposition'), /nodecal-0\.2\.0\.apk/);
  assert.strictEqual(await downloadResponse.text(), 'signed apk');
});
