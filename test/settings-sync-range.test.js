// Stub env vars so config.js doesn't throw during require
process.env.CALDAV_BASEURL = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = 'test';
process.env.CALDAV_PASSWORD = 'test';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSyncFutureDays } = require('../server/routes/settings');

// The settings UI shows an empty "Events future (days)" field for "no limit",
// but 0 stays the value on disk: installs predate the UI change and the client
// (rangeTo() in client/app/main.js, which widens 0 to a 10-year window) already
// reads 0 as unlimited. These tests pin that contract.
describe('normalizeSyncFutureDays', () => {
  it('keeps a legacy 0 as the unlimited sentinel', () => {
    assert.equal(normalizeSyncFutureDays(0), 0);
  });

  it('keeps a real day count', () => {
    assert.equal(normalizeSyncFutureDays(45), 45);
    assert.equal(normalizeSyncFutureDays(1), 1);
    assert.equal(normalizeSyncFutureDays(3650), 3650);
  });

  it('treats a blank field as unlimited', () => {
    assert.equal(normalizeSyncFutureDays(''), 0);
  });

  it('treats a missing value as unlimited', () => {
    assert.equal(normalizeSyncFutureDays(undefined), 0);
    assert.equal(normalizeSyncFutureDays(null), 0);
  });

  it('treats junk as unlimited rather than persisting it', () => {
    assert.equal(normalizeSyncFutureDays('soon'), 0);
    assert.equal(normalizeSyncFutureDays({}), 0);
    assert.equal(normalizeSyncFutureDays(Infinity), 0);
  });

  it('folds a negative day count back to unlimited', () => {
    assert.equal(normalizeSyncFutureDays(-30), 0);
  });

  it('accepts the numeric string a form might send', () => {
    assert.equal(normalizeSyncFutureDays('90'), 90);
  });

  it('truncates a fractional day count', () => {
    assert.equal(normalizeSyncFutureDays(30.9), 30);
  });
});
