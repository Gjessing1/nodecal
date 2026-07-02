const test = require('node:test');
const assert = require('node:assert');
const { taskAlarmDatetime } = require('../server/push/scheduler');

// Oslo is UTC+2 in July (CEST), so 09:00 local = 07:00Z
const CFG = {
  timezone: 'Europe/Oslo',
  taskReminderMorningTime: '09:00',
  taskReminderEveningTime: '18:00',
};

test('on-due fires at the morning time in the configured timezone', () => {
  const d = taskAlarmDatetime('2026-07-10', 'on-due', CFG);
  assert.equal(d.toISOString(), '2026-07-10T07:00:00.000Z');
});

test('evening-before fires the prior evening', () => {
  const d = taskAlarmDatetime('2026-07-10', 'evening-before', CFG);
  assert.equal(d.toISOString(), '2026-07-09T16:00:00.000Z');
});

test('morning-before fires the prior morning', () => {
  const d = taskAlarmDatetime('2026-07-10', 'morning-before', CFG);
  assert.equal(d.toISOString(), '2026-07-09T07:00:00.000Z');
});

test('custom-Nh fires N hours before the morning time', () => {
  const d = taskAlarmDatetime('2026-07-10', 'custom-4h', CFG);
  assert.equal(d.toISOString(), '2026-07-10T03:00:00.000Z');
});

test('winter time uses the CET offset', () => {
  // Oslo is UTC+1 in January
  const d = taskAlarmDatetime('2026-01-15', 'on-due', CFG);
  assert.equal(d.toISOString(), '2026-01-15T08:00:00.000Z');
});

test('none / missing due produce no alarm', () => {
  assert.equal(taskAlarmDatetime('2026-07-10', 'none', CFG), null);
  assert.equal(taskAlarmDatetime(null, 'on-due', CFG), null);
});
