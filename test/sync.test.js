// Stub env vars so config.js doesn't throw during require
process.env.CALDAV_BASEURL = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = 'test';
process.env.CALDAV_PASSWORD = 'test';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeSyncDiff, withRetry } = require('../server/caldav/sync');

// ── computeSyncDiff ───────────────────────────────────────

// The window the server was asked about. Only events inside it can be judged
// missing — see the "outside the sync window" tests below.
const FROM = new Date('2026-08-01T00:00:00Z');
const TO = new Date('2026-11-01T00:00:00Z');

/** A cached record sitting inside [FROM, TO]. */
function cachedEvent(uid, href, etag) {
  return {
    uid,
    href,
    etag,
    start: '2026-09-01T10:00:00.000Z',
    end: '2026-09-01T11:00:00.000Z',
  };
}

describe('computeSyncDiff', () => {
  it('returns nothing to do when etags all match', () => {
    const server = [
      { href: 'http://cal/a.ics', etag: 'aaa' },
      { href: 'http://cal/b.ics', etag: 'bbb' },
    ];
    const cached = [
      cachedEvent('1', 'http://cal/a.ics', 'aaa'),
      cachedEvent('2', 'http://cal/b.ics', 'bbb'),
    ];
    const { toFetch, toDelete } = computeSyncDiff(server, cached, FROM, TO);
    assert.deepEqual(toFetch, []);
    assert.deepEqual(toDelete, []);
  });

  it('marks new server events for fetch', () => {
    const server = [
      { href: 'http://cal/a.ics', etag: 'aaa' },
      { href: 'http://cal/new.ics', etag: 'nnn' }, // new
    ];
    const cached = [cachedEvent('1', 'http://cal/a.ics', 'aaa')];
    const { toFetch, toDelete } = computeSyncDiff(server, cached, FROM, TO);
    assert.deepEqual(toFetch, ['http://cal/new.ics']);
    assert.deepEqual(toDelete, []);
  });

  it('marks stale-etag events for fetch', () => {
    const server = [{ href: 'http://cal/a.ics', etag: 'new-etag' }];
    const cached = [cachedEvent('1', 'http://cal/a.ics', 'old-etag')];
    const { toFetch, toDelete } = computeSyncDiff(server, cached, FROM, TO);
    assert.deepEqual(toFetch, ['http://cal/a.ics']);
    assert.deepEqual(toDelete, []);
  });

  it('marks removed server events for deletion', () => {
    const server = [{ href: 'http://cal/a.ics', etag: 'aaa' }];
    const cached = [
      cachedEvent('1', 'http://cal/a.ics', 'aaa'),
      cachedEvent('2', 'http://cal/gone.ics', 'ggg'), // deleted on server
    ];
    const { toFetch, toDelete } = computeSyncDiff(server, cached, FROM, TO);
    assert.deepEqual(toFetch, []);
    assert.deepEqual(toDelete, ['2']);
  });

  it('handles all three changes at once', () => {
    const server = [
      { href: 'http://cal/unchanged.ics', etag: 'uuu' },
      { href: 'http://cal/changed.ics', etag: 'new' },
      { href: 'http://cal/added.ics', etag: 'aaa' },
      // deleted.ics is absent
    ];
    const cached = [
      cachedEvent('u', 'http://cal/unchanged.ics', 'uuu'),
      cachedEvent('c', 'http://cal/changed.ics', 'old'),
      cachedEvent('d', 'http://cal/deleted.ics', 'ddd'),
    ];
    const { toFetch, toDelete } = computeSyncDiff(server, cached, FROM, TO);
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
    const { toFetch, toDelete } = computeSyncDiff(server, [], FROM, TO);
    assert.equal(toFetch.length, 2);
    assert.deepEqual(toDelete, []);
  });

  // The etag listing is time-filtered, so absence from it only means "deleted"
  // for events the server was actually asked about. Deleting the rest is how
  // history older than the window used to vanish on the next sync.
  it('keeps a cached event that sits before the sync window', () => {
    const server = [];
    const cached = [
      {
        uid: 'old',
        href: 'http://cal/old.ics',
        etag: 'ooo',
        start: '2020-01-01T10:00:00.000Z',
        end: '2020-01-01T11:00:00.000Z',
      },
    ];
    const { toDelete } = computeSyncDiff(server, cached, FROM, TO);
    assert.deepEqual(toDelete, []);
  });

  it('keeps a cached event that sits after the sync window', () => {
    const server = [];
    const cached = [
      {
        uid: 'future',
        href: 'http://cal/future.ics',
        etag: 'fff',
        start: '2031-01-01T10:00:00.000Z',
        end: '2031-01-01T11:00:00.000Z',
      },
    ];
    const { toDelete } = computeSyncDiff(server, cached, FROM, TO);
    assert.deepEqual(toDelete, []);
  });

  it('still deletes an open-ended series the server no longer lists', () => {
    // It started long before the window but recurs into it, so the server would
    // have listed it — absence really does mean deleted.
    const cached = [
      {
        uid: 'weekly',
        href: 'http://cal/weekly.ics',
        etag: 'www',
        start: '2020-01-06T10:00:00.000Z',
        end: '2020-01-06T11:00:00.000Z',
        rrule: 'FREQ=WEEKLY',
      },
    ];
    const { toDelete } = computeSyncDiff([], cached, FROM, TO);
    assert.deepEqual(toDelete, ['weekly']);
  });

  it('keeps a finished series whose last occurrence predates the window', () => {
    const cached = [
      {
        uid: 'ended',
        href: 'http://cal/ended.ics',
        etag: 'eee',
        start: '2020-01-06T10:00:00.000Z',
        end: '2020-01-06T11:00:00.000Z',
        rrule: 'FREQ=WEEKLY;COUNT=3',
      },
    ];
    const { toDelete } = computeSyncDiff([], cached, FROM, TO);
    assert.deepEqual(toDelete, []);
  });

  it('deletes a master and its overrides together, by cache key', () => {
    // One resource, one href, one etag: the series and its edited occurrences
    // are fetched and dropped as a unit.
    const cached = [
      cachedEvent('series', 'http://cal/series.ics', 'sss'),
      {
        ...cachedEvent('series', 'http://cal/series.ics', 'sss'),
        recurrenceId: '2026-09-08T10:00:00.000Z',
      },
    ];
    const { toDelete } = computeSyncDiff([], cached, FROM, TO);
    assert.deepEqual(toDelete, ['series', 'series::2026-09-08T10:00:00.000Z']);
  });

  it('fetches a resource once even though it holds several records', () => {
    const server = [{ href: 'http://cal/series.ics', etag: 'new' }];
    const cached = [
      cachedEvent('series', 'http://cal/series.ics', 'old'),
      {
        ...cachedEvent('series', 'http://cal/series.ics', 'old'),
        recurrenceId: '2026-09-08T10:00:00.000Z',
      },
    ];
    const { toFetch } = computeSyncDiff(server, cached, FROM, TO);
    assert.deepEqual(toFetch, ['http://cal/series.ics']);
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
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('transient');
        return 'ok';
      },
      3,
      0,
    );
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
  });

  it('throws after exhausting retries', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls++;
          throw new Error('always fails');
        },
        2,
        0,
      ),
      /always fails/,
    );
    assert.equal(calls, 3); // 1 initial + 2 retries
  });
});
