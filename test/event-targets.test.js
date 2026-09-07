// Which calendars are offered as targets for a new event. A Radicale task
// collection advertises VEVENT support like any other calendar, so the app has
// to keep it out of the event pickers itself — otherwise the only way to stop
// "Tasks 🏠" appearing in the quick-add "To:" row is to hide the calendar, which
// also empties the Tasks view.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const stateUrl = pathToFileURL(path.join(__dirname, '..', 'client', 'app', 'state.js')).href;
const targetsUrl = pathToFileURL(
  path.join(__dirname, '..', 'client', 'app', 'profileTargets.js'),
).href;
const calendarSettingsUrl = pathToFileURL(
  path.join(__dirname, '..', 'client', 'components', 'settings', 'calendars.js'),
).href;

const CAL = 'http://dav.test/user/kalender/';
const BIRTHDAYS = 'http://dav.test/user/birthdays/';
const TASKS_HOME = 'http://dav.test/user/tasks-home/';
const TASKS_WORK = 'http://dav.test/user/tasks-work/';
const FEED = 'ics:work';

async function load({ calendars, taskSources, hidden = [] }) {
  const { state } = await import(stateUrl);
  const targets = await import(targetsUrl);
  state.calendars = calendars;
  state.taskSources = taskSources;
  state.hiddenCalendars = new Set(hidden);
  state.config.profiles = { single: { name: 'Single', hiddenCalendars: [] } };
  state.config.activeProfile = 'single';
  return { state, targets };
}

const ALL = [
  { id: CAL, name: 'Kalender' },
  { id: BIRTHDAYS, name: 'Birthdays' },
  { id: TASKS_HOME, name: 'Tasks 🏠' },
  { id: TASKS_WORK, name: 'Tasks 🏢' },
  { id: FEED, name: 'Enora', readOnly: true },
];
const SOURCES = [
  { url: TASKS_HOME, name: 'Tasks' },
  { url: TASKS_WORK, name: 'Work Tasks' },
];

test('quick-add offers neither task lists nor read-only feeds', async () => {
  const { targets } = await load({ calendars: ALL, taskSources: SOURCES });
  const ids = targets.targetCalendars().map((c) => c.id);
  assert.deepStrictEqual(ids, [CAL, BIRTHDAYS]);
});

test('a hidden calendar is still left out of the quick-add', async () => {
  const { targets } = await load({ calendars: ALL, taskSources: SOURCES, hidden: [BIRTHDAYS] });
  const ids = targets.targetCalendars().map((c) => c.id);
  assert.deepStrictEqual(ids, [CAL]);
});

test('the full editor still honors a configured calendar hidden from the active view', async () => {
  const { state, targets } = await load({
    calendars: ALL,
    taskSources: SOURCES,
    hidden: [CAL],
  });
  state.config.defaultCalendar = CAL;
  assert.strictEqual(targets.resolveEventCalendar(), BIRTHDAYS);
  assert.strictEqual(targets.resolveEditorCalendar(), CAL);
});

test('a collection holding both tasks and events stays offered when it is the only one', async () => {
  const { targets } = await load({
    calendars: [{ id: CAL, name: 'Kalender' }],
    taskSources: [{ url: CAL, name: 'Kalender' }],
  });
  const ids = targets.targetCalendars().map((c) => c.id);
  assert.deepStrictEqual(ids, [CAL]);
});

test('the event editor drops task lists but ignores profile visibility', async () => {
  const { targets } = await load({ calendars: ALL, taskSources: SOURCES, hidden: [BIRTHDAYS] });
  const ids = targets.eventCalendars().map((c) => c.id);
  assert.deepStrictEqual(ids, [CAL, BIRTHDAYS]);
});

test('an event already living in a task list keeps its own calendar in the editor', async () => {
  const { targets } = await load({ calendars: ALL, taskSources: SOURCES });
  const ids = targets.eventCalendars(TASKS_HOME).map((c) => c.id);
  assert.deepStrictEqual(ids, [TASKS_HOME, CAL, BIRTHDAYS]);
});

test('resolveEventCalendar never lands on a task list', async () => {
  const { state, targets } = await load({ calendars: ALL, taskSources: SOURCES });
  state.config.defaultCalendar = TASKS_WORK;
  assert.strictEqual(targets.resolveEventCalendar(), CAL);
});

test('calendar settings show the active profile override instead of a misleading global value', async () => {
  const { state } = await load({ calendars: ALL, taskSources: SOURCES });
  const { effectiveDraftCalendar } = await import(calendarSettingsUrl);
  state.config.defaultCalendar = CAL;
  state.config.profiles.single.defaultEventCalendar = BIRTHDAYS;
  assert.strictEqual(effectiveDraftCalendar(state.config), BIRTHDAYS);
});

test('choosing the main default clears the active profile override', async () => {
  const { state, targets } = await load({ calendars: ALL, taskSources: SOURCES });
  const { setDraftCalendar } = await import(calendarSettingsUrl);
  state.config.defaultCalendar = BIRTHDAYS;
  state.config.profiles.single.defaultEventCalendar = BIRTHDAYS;

  setDraftCalendar(state.config, CAL);

  assert.strictEqual(state.config.defaultCalendar, CAL);
  assert.strictEqual(state.config.profiles.single.defaultEventCalendar, '');
  assert.strictEqual(targets.resolveEventCalendar(), CAL);
});
