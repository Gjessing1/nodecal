process.env.CALDAV_BASEURL = process.env.CALDAV_BASEURL || 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = process.env.CALDAV_USERNAME || 'test';
process.env.CALDAV_PASSWORD = process.env.CALDAV_PASSWORD || 'test';

const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nodecal-tokens-'));
process.env.NODECAL_TOKENS_FILE = path.join(dir, 'tokens.json');

const { it, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const tokens = require('../server/integrations/tokens');
const glanceRouter = require('../server/routes/glance');

after(() => fs.rmSync(dir, { recursive: true, force: true }));

it('stores only a hash and shows the token once', () => {
  const created = tokens.createToken('Glance phone');
  const raw = fs.readFileSync(process.env.NODECAL_TOKENS_FILE, 'utf8');
  assert.ok(!raw.includes(created.token));
  const listed = tokens.listTokens().find((record) => record.id === created.id);
  assert.deepEqual(Object.keys(listed || {}).sort(), ['createdAt', 'id', 'label', 'lastUsedAt']);
  assert.equal(listed?.label, 'Glance phone');
});

it('verifies, stamps last use, and stops working once revoked', () => {
  const created = tokens.createToken('');
  assert.equal(tokens.verifyToken('ncl_wrong'), null);
  assert.equal(tokens.verifyToken(created.token)?.id, created.id);
  const listed = tokens.listTokens().find((record) => record.id === created.id);
  assert.ok(listed?.lastUsedAt);
  assert.equal(listed?.label, 'Integration');
  assert.equal(tokens.revokeToken(created.id), true);
  assert.equal(tokens.verifyToken(created.token), null);
  assert.equal(tokens.revokeToken(created.id), false);
});

it('answers the agenda only with a valid bearer token, never with a redirect', async () => {
  const created = tokens.createToken('route');
  const app = express();
  app.use('/api', glanceRouter);
  const server = app.listen(0);
  const address = /** @type {import('net').AddressInfo} */ (server.address());
  const url = `http://127.0.0.1:${address.port}/api/glance/agenda`;
  try {
    const missing = await fetch(url, { redirect: 'manual' });
    assert.equal(missing.status, 401);
    const wrong = await fetch(url, { headers: { Authorization: 'Bearer nope' } });
    assert.equal(wrong.status, 401);
    const ok = await fetch(url, { headers: { Authorization: `Bearer ${created.token}` } });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.ok(Array.isArray(body.events));
    assert.ok(body.generatedAt);
  } finally {
    server.close();
  }
});
