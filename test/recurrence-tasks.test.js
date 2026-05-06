const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeNextDue, parseXInterval } = require('../server/caldav/recurrence');

// ── parseXInterval ────────────────────────────────────────

describe('parseXInterval', () => {
  it('parses "daily"', () => {
    assert.equal(parseXInterval('daily'), 86400000);
  });

  it('parses "weekly"', () => {
    assert.equal(parseXInterval('weekly'), 7 * 86400000);
  });

  it('parses "Nd" format', () => {
    assert.equal(parseXInterval('3d'), 3 * 86400000);
    assert.equal(parseXInterval('10d'), 10 * 86400000);
  });

  it('parses "Nw" format', () => {
    assert.equal(parseXInterval('2w'), 2 * 7 * 86400000);
  });

  it('returns null for unknown formats', () => {
    assert.equal(parseXInterval('monthly'), null);
    assert.equal(parseXInterval(''), null);
    assert.equal(parseXInterval(null), null);
  });
});

// ── computeNextDue — X-RECURRING ─────────────────────────

describe('computeNextDue with X-RECURRING', () => {
  it('returns completionDate + interval', () => {
    const task = {
      due: '2026-05-01',
      xRecurringType: 'after-completion',
      xRecurringInterval: '5d',
      rrule: null,
    };
    const completion = new Date('2026-05-04T10:00:00Z'); // completed 3 days late
    const next = computeNextDue(task, completion);
    assert.ok(next instanceof Date);
    // next = completion + 5 days
    const expected = new Date('2026-05-09T10:00:00Z');
    assert.equal(next.toISOString(), expected.toISOString());
  });

  it('X-RECURRING wins over RRULE when both present', () => {
    const task = {
      due: '2026-05-01',
      xRecurringType: 'after-completion',
      xRecurringInterval: 'weekly',
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
    };
    const completion = new Date('2026-05-10T00:00:00Z');
    const next = computeNextDue(task, completion);
    // X-RECURRING: completion + 7 days (not monthly from due)
    const expected = new Date(completion.getTime() + 7 * 86400000);
    assert.equal(next.toISOString(), expected.toISOString());
  });

  it('clock resets from completion, not from due date', () => {
    const task = {
      due: '2026-05-01',  // Monday
      xRecurringType: 'after-completion',
      xRecurringInterval: '3d',
      rrule: null,
    };
    // Completed Thursday (3 days late)
    const completion = new Date('2026-05-07T08:00:00Z');
    const next = computeNextDue(task, completion);
    const expected = new Date('2026-05-10T08:00:00Z'); // Thursday + 3d = Sunday
    assert.equal(next.toISOString(), expected.toISOString());
  });
});

// ── computeNextDue — RRULE ───────────────────────────────

describe('computeNextDue with RRULE', () => {
  it('preserves fixed schedule regardless of completion date', () => {
    const task = {
      due: '2026-05-01',
      rrule: 'FREQ=MONTHLY;BYMONTHDAY=1',
      xRecurringType: null,
      xRecurringInterval: null,
    };
    // Completed on the 4th (3 days late)
    const next = computeNextDue(task, new Date('2026-05-04T12:00:00Z'));
    assert.ok(next instanceof Date);
    // Next due = June 1st (rrule.after(May 1) in UTC)
    assert.equal(next.toISOString().slice(0, 10), '2026-06-01');
  });

  it('preserves weekly schedule even when completed late', () => {
    const task = {
      due: '2026-05-04',  // Monday
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      xRecurringType: null,
      xRecurringInterval: null,
    };
    // Completed Thursday
    const next = computeNextDue(task, new Date('2026-05-07T00:00:00Z'));
    assert.ok(next instanceof Date);
    // Next due = Monday May 11 (not Thursday + 7)
    assert.equal(next.toISOString().slice(0, 10), '2026-05-11');
  });

  it('returns null when due is missing', () => {
    const task = { due: null, rrule: 'FREQ=DAILY', xRecurringType: null };
    const next = computeNextDue(task, new Date());
    assert.equal(next, null);
  });

  it('returns null for invalid RRULE', () => {
    const task = { due: '2026-05-01', rrule: 'FREQ=INVALID', xRecurringType: null };
    const next = computeNextDue(task, new Date());
    assert.equal(next, null);
  });
});

// ── computeNextDue — no recurrence ──────────────────────

describe('computeNextDue without recurrence', () => {
  it('returns null when task has no recurrence', () => {
    const task = { due: '2026-05-01', rrule: null, xRecurringType: null };
    const next = computeNextDue(task, new Date());
    assert.equal(next, null);
  });
});
