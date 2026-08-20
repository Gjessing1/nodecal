const test = require('node:test');
const assert = require('node:assert');
const { taskAlarmDatetime } = require('../server/push/reminders');

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

// ── collectReminders ──────────────────────────────────────

const store = require('../server/cache/store');
const { collectReminders } = require('../server/push/reminders');

const BASE = Date.parse('2026-07-10T12:00:00Z');

function seedEvent(uid, startIso, alarmMinutes, extra = {}) {
  store.setEventSilent({
    uid,
    id: uid,
    title: `Event ${uid}`,
    start: startIso,
    end: startIso,
    allDay: false,
    alarmMinutes,
    ...extra,
  });
}

test.beforeEach(() => {
  store.clearEvents();
  for (const task of store.getTasks()) store.removeTaskSilent(task.uid);
});

test('an event alarm inside the window is collected', () => {
  seedEvent('e1', '2026-07-10T13:00:00Z', 15); // fires 12:45Z
  const found = collectReminders(new Date(BASE), new Date(BASE + 3600000), CFG);
  assert.equal(found.length, 1);
  assert.equal(found[0].at, '2026-07-10T12:45:00.000Z');
  assert.equal(found[0].kind, 'event');
  assert.equal(found[0].targetId, 'e1');
  assert.equal(found[0].tag, 'ev-e1');
});

test('a moved recurring occurrence fires only at its overridden time', () => {
  seedEvent('series', '2026-07-06T13:00:00Z', 15, {
    end: '2026-07-06T14:00:00Z',
    rrule: 'FREQ=WEEKLY;COUNT=3',
  });
  seedEvent('series', '2026-07-13T15:00:00Z', 15, {
    title: 'Event series (moved)',
    end: '2026-07-13T16:00:00Z',
    recurrenceId: '2026-07-13T13:00:00.000Z',
    rrule: null,
  });

  const found = collectReminders(
    new Date('2026-07-13T12:30:00Z'),
    new Date('2026-07-13T15:00:00Z'),
    CFG,
  );

  assert.equal(found.length, 1);
  assert.equal(found[0].title, 'Event series (moved)');
  assert.equal(found[0].at, '2026-07-13T14:45:00.000Z');
  assert.equal(found[0].targetId, 'series_2026-07-13T13:00:00.000Z');
});

test('the window is exclusive at the start and inclusive at the end', () => {
  seedEvent('at-start', '2026-07-10T12:15:00Z', 15); // fires exactly at `from`
  seedEvent('at-end', '2026-07-10T13:15:00Z', 15); // fires exactly at `to`
  const found = collectReminders(new Date(BASE), new Date(BASE + 3600000), CFG);
  assert.deepEqual(
    found.map((r) => r.targetId),
    ['at-end'],
  );
});

test('all-day events and events with no alarm never fire', () => {
  seedEvent('no-alarm', '2026-07-10T13:00:00Z', null);
  seedEvent('all-day', '2026-07-10T13:00:00Z', 15, { allDay: true });
  assert.deepEqual(collectReminders(new Date(BASE), new Date(BASE + 7200000), CFG), []);
});

test('a completed task never fires', () => {
  store.setTaskSilent({
    uid: 't1',
    title: 'Done',
    due: '2026-07-11',
    taskReminder: 'on-due',
    status: 'COMPLETED',
  });
  assert.deepEqual(collectReminders(new Date(BASE), new Date(BASE + 86400000), CFG), []);
});

test('events and tasks come back in fire order', () => {
  seedEvent('later', '2026-07-10T20:00:00Z', 15); // fires 19:45Z
  store.setTaskSilent({
    uid: 't2',
    title: 'Task',
    due: '2026-07-11',
    taskReminder: 'evening-before',
    status: 'NEEDS-ACTION',
  }); // 18:00 Oslo on the 10th = 16:00Z
  const found = collectReminders(new Date(BASE), new Date(BASE + 86400000), CFG);
  assert.deepEqual(
    found.map((r) => r.targetId),
    ['t2', 'later'],
  );
});
