// Stub env vars so config.js doesn't throw during require
process.env.CALDAV_BASEURL   = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME  = 'test';
process.env.CALDAV_PASSWORD  = 'test';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeSyncDiff, withRetry } = require('../server/caldav/sync');

// ── computeSyncDiff ───────────────────────────────────────

describe('computeSyncDiff', () => {
  it('returns nothing to do when etags all match', () => {
    const server = [
      { href: 'http://cal/a.ics', etag: 'aaa' },
      { href: 'http://cal/b.ics', etag: 'bbb' },
    ];
    const cached = [
      { uid: '1', href: 'http://cal/a.ics', etag: 'aaa' },
      { uid: '2', href: 'http://cal/b.ics', etag: 'bbb' },
    ];
    const { toFetch, toDelete } = computeSyncDiff(server, cached);
    assert.deepEqual(toFetch, []);
    assert.deepEqual(toDelete, []);
  });

  it('marks new server events for fetch', () => {
    const server = [
      { href: 'http://cal/a.ics', etag: 'aaa' },
      { href: 'http://cal/new.ics', etag: 'nnn' }, // new
    ];
    const cached = [
      { uid: '1', href: 'http://cal/a.ics', etag: 'aaa' },
    ];
    const { toFetch, toDelete } = computeSyncDiff(server, cached);
    assert.deepEqual(toFetch, ['http://cal/new.ics']);
    assert.deepEqual(toDelete, []);
  });

  it('marks stale-etag events for fetch', () => {
    const server = [{ href: 'http://cal/a.ics', etag: 'new-etag' }];
    const cached = [{ uid: '1', href: 'http://cal/a.ics', etag: 'old-etag' }];
    const { toFetch, toDelete } = computeSyncDiff(server, cached);
    assert.deepEqual(toFetch, ['http://cal/a.ics']);
    assert.deepEqual(toDelete, []);
  });

  it('marks removed server events for deletion', () => {
    const server = [{ href: 'http://cal/a.ics', etag: 'aaa' }];
    const cached = [
      { uid: '1', href: 'http://cal/a.ics', etag: 'aaa' },
      { uid: '2', href: 'http://cal/gone.ics', etag: 'ggg' }, // deleted on server
    ];
    const { toFetch, toDelete } = computeSyncDiff(server, cached);
    assert.deepEqual(toFetch, []);
    assert.deepEqual(toDelete, ['2']);
  });

  it('handles all three changes at once', () => {
    const server = [
      { href: 'http://cal/unchanged.ics', etag: 'uuu' },
      { href: 'http://cal/changed.ics',   etag: 'new' },
      { href: 'http://cal/added.ics',     etag: 'aaa' },
      // deleted.ics is absent
    ];
    const cached = [
      { uid: 'u', href: 'http://cal/unchanged.ics', etag: 'uuu' },
      { uid: 'c', href: 'http://cal/changed.ics',   etag: 'old' },
      { uid: 'd', href: 'http://cal/deleted.ics',   etag: 'ddd' },
    ];
    const { toFetch, toDelete } = computeSyncDiff(server, cached);
    assert.ok(toFetch.includes('http://cal/changed.ics'));
    assert.ok(toFetch.includes('http://cal/added.ics'));
    assert.ok(!toFetch.includes('http://cal/unchanged.ics'));
    assert.deepEqual(toDelete, ['d']);
  });

  it('returns all server events for fetch when cache is empty', () => {
    const server = [
      { href: 'http://cal/a.ics', etag: 'aaa' },
      { href: 'http://cal/b.ics', etag: 'bbb' },
    ];
    const { toFetch, toDelete } = computeSyncDiff(server, []);
    assert.equal(toFetch.length, 2);
    assert.deepEqual(toDelete, []);
  });
});

// ── withRetry ─────────────────────────────────────────────

describe('withRetry', () => {
  it('returns result immediately on success', async () => {
    const result = await withRetry(async () => 42, 3, 0);
    assert.equal(result, 42);
  });

  it('retries and succeeds after transient failures', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error('transient');
      return 'ok';
    }, 3, 0);
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
  });

  it('throws after exhausting retries', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(async () => { calls++; throw new Error('always fails'); }, 2, 0),
      /always fails/
    );
    assert.equal(calls, 3); // 1 initial + 2 retries
  });
});
