const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseTask } = require('../server/nlp/taskParser');

const REF = new Date('2026-05-08T12:00:00Z'); // Friday

describe('parseTask — English', () => {
  it('extracts due date from "buy milk tomorrow"', () => {
    const r = parseTask('buy milk tomorrow', REF);
    assert.equal(r.title, 'buy milk');
    assert.equal(r.due, '2026-05-09');
    assert.equal(r.parsed, true);
  });

  it('extracts RRULE from "buy milk every 3 days"', () => {
    const r = parseTask('buy milk every 3 days', REF);
    assert.equal(r.title, 'buy milk');
    assert.equal(r.rrule, 'FREQ=DAILY;INTERVAL=3');
    assert.equal(r.xRecurringType, null);
  });

  it('extracts RRULE from "gym every friday"', () => {
    const r = parseTask('gym every friday', REF);
    assert.equal(r.title, 'gym');
    assert.equal(r.rrule, 'FREQ=WEEKLY;BYDAY=FR');
  });

  it('extracts after-completion from "water plants after completion every 5 days"', () => {
    const r = parseTask('water plants after completion every 5 days', REF);
    assert.equal(r.title, 'water plants');
    assert.equal(r.xRecurringType, 'after-completion');
    assert.equal(r.xRecurringInterval, '5d');
    assert.equal(r.rrule, null);
  });

  it('extracts after-completion from "every 2 weeks after completion"', () => {
    const r = parseTask('every 2 weeks after completion', REF);
    assert.equal(r.xRecurringType, 'after-completion');
    assert.equal(r.xRecurringInterval, '2w');
  });

  it('extracts after-completion from "after completion every 3 days"', () => {
    const r = parseTask('after completion every 3 days', REF);
    assert.equal(r.xRecurringType, 'after-completion');
    assert.equal(r.xRecurringInterval, '3d');
  });

  it('combines due date + recurrence', () => {
    const r = parseTask('check plants after completion every 2 weeks tomorrow', REF);
    assert.equal(r.xRecurringType, 'after-completion');
    assert.equal(r.xRecurringInterval, '2w');
    assert.equal(r.due, '2026-05-09');
  });

  it('returns parsed:false for plain text with no date or recurrence', () => {
    const r = parseTask('some random text', REF);
    assert.equal(r.parsed, false);
  });

  it('handles "next monday"', () => {
    const r = parseTask('dentist next monday', REF);
    assert.equal(r.title, 'dentist');
    assert.equal(r.due, '2026-05-11');
  });
});

describe('parseTask — Norwegian', () => {
  it('kjøp melk mandag → buy milk monday', () => {
    const r = parseTask('kjøp melk mandag', REF);
    assert.equal(r.title, 'kjøp melk');
    assert.equal(r.due, '2026-05-11');
  });

  it('møte i morgen → meeting tomorrow', () => {
    const r = parseTask('møte i morgen', REF);
    assert.equal(r.title, 'møte');
    assert.equal(r.due, '2026-05-09');
  });

  it('tannlege neste mandag → dentist next monday', () => {
    const r = parseTask('tannlege neste mandag', REF);
    assert.equal(r.title, 'tannlege');
    assert.equal(r.due, '2026-05-11');
  });

  it('vann planter etter fullføring hver 5 dag', () => {
    const r = parseTask('vann planter etter fullføring hver 5 dag', REF);
    assert.equal(r.title, 'vann planter');
    assert.equal(r.xRecurringType, 'after-completion');
    assert.equal(r.xRecurringInterval, '5d');
  });

  it('gjør lekser hver 3 dag → homework every 3 days', () => {
    const r = parseTask('gjør lekser hver 3 dag', REF);
    assert.equal(r.title, 'gjør lekser');
    assert.equal(r.rrule, 'FREQ=DAILY;INTERVAL=3');
  });
});
