const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { expandRecurring, setRruleUntil, parseExdate } = require('../server/caldav/recurrence');

const FROM = new Date('2024-01-01T00:00:00Z');
const TO   = new Date('2024-03-01T00:00:00Z');

function base(overrides = {}) {
  return {
    uid: 'test-uid',
    title: 'Test',
    start: '2024-01-01T09:00:00.000Z',
    end:   '2024-01-01T10:00:00.000Z',
    allDay: false,
    description: '',
    location: '',
    calendarId: 'http://cal/',
    ...overrides,
  };
}

describe('expandRecurring', () => {
  it('expands a daily event', () => {
    const occ = expandRecurring(base({ rrule: 'FREQ=DAILY;COUNT=3' }), FROM, TO);
    assert.equal(occ.length, 3);
    assert.equal(new Date(occ[0].start).toISOString(), '2024-01-01T09:00:00.000Z');
    assert.equal(new Date(occ[1].start).toISOString(), '2024-01-02T09:00:00.000Z');
    assert.equal(new Date(occ[2].start).toISOString(), '2024-01-03T09:00:00.000Z');
  });

  it('expands a weekly event, preserving duration', () => {
    const occ = expandRecurring(base({ rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4' }), FROM, TO);
    assert.equal(occ.length, 4);
    // Each occurrence is 1 hour long (same as base)
    for (const o of occ) {
      assert.equal(new Date(o.end) - new Date(o.start), 3600000);
    }
  });

  it('expands a monthly event', () => {
    const occ = expandRecurring(base({ rrule: 'FREQ=MONTHLY;COUNT=2' }), FROM, TO);
    assert.equal(occ.length, 2);
    assert.match(occ[0].start, /^2024-01-01/);
    assert.match(occ[1].start, /^2024-02-01/);
  });

  it('respects UNTIL in RRULE', () => {
    const occ = expandRecurring(base({ rrule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20240115T000000Z' }), FROM, TO);
    assert.equal(occ.length, 2); // Jan 1 and Jan 8 (Jan 15 is excluded by UNTIL)
  });

  it('excludes dates from EXDATE', () => {
    const occ = expandRecurring(
      base({ rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4', exdates: ['20240108T090000Z'] }),
      FROM, TO,
    );
    assert.equal(occ.length, 3);
    const starts = occ.map(o => o.start);
    assert.ok(!starts.some(s => s.startsWith('2024-01-08')), 'Jan 8 should be excluded');
  });

  it('attaches recurring=true and unique id to each occurrence', () => {
    const occ = expandRecurring(base({ rrule: 'FREQ=DAILY;COUNT=2' }), FROM, TO);
    assert.ok(occ[0].recurring);
    assert.ok(occ[1].recurring);
    assert.notEqual(occ[0].id, occ[1].id);
    assert.ok(occ[0].id.startsWith('test-uid_'));
  });

  it('returns empty array for invalid RRULE', () => {
    const occ = expandRecurring(base({ rrule: 'FREQ=INVALID' }), FROM, TO);
    assert.equal(occ.length, 0);
  });
});

describe('setRruleUntil', () => {
  it('adds UNTIL to a rule without one', () => {
    const result = setRruleUntil('FREQ=WEEKLY;BYDAY=MO', new Date('2024-06-01T00:00:00Z'));
    assert.ok(result.includes('UNTIL='));
    assert.ok(result.includes('FREQ=WEEKLY'));
  });

  it('replaces an existing UNTIL', () => {
    const result = setRruleUntil('FREQ=WEEKLY;UNTIL=20241231T000000Z', new Date('2024-06-01T00:00:00Z'));
    assert.ok(result.includes('20240601'));
    assert.ok(!result.includes('20241231'));
  });

  it('replaces COUNT with UNTIL', () => {
    const result = setRruleUntil('FREQ=WEEKLY;COUNT=10', new Date('2024-06-01T00:00:00Z'));
    assert.ok(!result.includes('COUNT'));
    assert.ok(result.includes('UNTIL='));
  });
});

describe('parseExdate', () => {
  it('parses UTC datetime', () => {
    const d = parseExdate('20240108T090000Z');
    assert.equal(d.toISOString(), '2024-01-08T09:00:00.000Z');
  });

  it('parses date-only', () => {
    const d = parseExdate('20240108');
    assert.equal(d.getUTCFullYear(), 2024);
    assert.equal(d.getUTCMonth(), 0);
    assert.equal(d.getUTCDate(), 8);
  });
});
