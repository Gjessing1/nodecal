const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const router = Router();
const SETTINGS_FILE = '/config/settings.json';
const ALL_VIEWS = ['agenda', 'day', 'week', 'month'];

function readOverrides() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * `syncFutureDays` is how many days ahead events are fetched, and 0 has always
 * meant "no limit". Settings files in the wild already store 0 that way, so 0
 * stays the wire value for unlimited even though the UI now shows an empty
 * field instead. Anything missing, blank, negative or unparseable collapses to
 * it rather than being written to disk as junk.
 * @param {*} value
 * @returns {number} days ahead, or 0 for no limit
 */
function normalizeSyncFutureDays(value) {
  const days = Math.trunc(Number(value));
  if (!Number.isFinite(days)) return 0;
  if (days < 0) return 0;
  return days;
}

// Mirrors BOARD_FIELDS in client/app/boardBuckets.js.
const BOARD_FIELDS = ['status', 'priority', 'category', 'due', 'source', 'starred'];
const MAX_TASK_BOARDS = 20;

/**
 * Task boards arrive from the settings editor as `{ id, name, columns, lanes }`.
 * A board the kanban view could not draw — unknown field, no id, a duplicate —
 * is dropped here instead of being persisted and silently ignored later. Lanes
 * grouping by the same field as the columns would be a single diagonal, so they
 * collapse to "no lanes".
 * @param {*} value
 * @returns {Array<{id: string, name: string, columns: string, lanes: string}>}
 */
function normalizeTaskBoards(value) {
  if (!Array.isArray(value)) return [];
  const boards = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '').trim();
    if (!id || id.length > 64 || seen.has(id)) continue;
    if (!BOARD_FIELDS.includes(item.columns)) continue;
    let lanes = '';
    if (BOARD_FIELDS.includes(item.lanes) && item.lanes !== item.columns) lanes = item.lanes;
    const name = String(item.name || '').trim() || 'Board';
    seen.add(id);
    boards.push({ id, name: name.slice(0, 60), columns: item.columns, lanes });
    if (boards.length === MAX_TASK_BOARDS) break;
  }
  return boards;
}

router.get('/settings', (req, res) => {
  const overrides = readOverrides();
  res.json({
    siteTitle: config.app.siteTitle,
    defaultView: config.app.defaultView,
    timeFormat: config.app.timeFormat,
    weekStart: config.app.weekStart,
    timezone: config.app.timezone,
    enabledViews: ALL_VIEWS,
    authEnabled: !!config.app.appPassword && !config.app.bypassAuth,
    enableTasksView: false,
    showTasksOnCalendar: false,
    taskSortOrder: 'due',
    tasksCalDAVUrl: config.caldav.tasksUrl || '',
    hiddenCategories: [],
    hiddenEventCategories: [],
    icsFeeds: [],
    activeProfile: 'personal',
    profiles: {
      single: {
        name: 'Single',
        hiddenCalendars: [],
        accentColor: '',
        defaultTaskSource: '',
        defaultEventCalendar: '',
        defaultView: '',
      },
      personal: {
        name: 'Personal',
        hiddenCalendars: [],
        accentColor: '',
        defaultTaskSource: '',
        defaultEventCalendar: '',
        defaultView: '',
      },
      work: {
        name: 'Work',
        hiddenCalendars: [],
        accentColor: '',
        defaultTaskSource: '',
        defaultEventCalendar: '',
        defaultView: '',
      },
      combined: {
        name: 'Combined',
        hiddenCalendars: [],
        accentColor: '',
        defaultTaskSource: '',
        defaultEventCalendar: '',
        defaultView: '',
      },
    },
    ...overrides,
  });
});

router.put('/settings', (req, res) => {
  const allowed = [
    'defaultView',
    'timeFormat',
    'weekStart',
    'enabledViews',
    'defaultCalendar',
    'enableTasksView',
    'showTasksOnCalendar',
    'taskSortOrder',
    'tasksCalDAVUrl',
    'hiddenCategories',
    'hiddenEventCategories',
    'taskSources',
    'defaultTaskSource',
    'defaultEventTime',
    'defaultEventDuration',
    'showWeekNumbers',
    'dateFormat',
    'weatherLat',
    'weatherLon',
    'weatherDays',
    'weatherDaysWeek',
    'weatherDaysMonth',
    'weatherDaysAgenda',
    'showWeekendBg',
    'showTasksOnDay',
    'showTasksOnWeek',
    'showTasksOnMonth',
    'showTasksOnAgenda',
    'showWeekNumbersDay',
    'showWeekNumbersMonth',
    'showWeekNumbersAgenda',
    'enableNotifications',
    'alarmDefaultMinutes',
    'taskReminderDefault',
    'taskReminderMorningTime',
    'taskReminderEveningTime',
    'syncIntervalMinutes',
    'syncHistoryDays',
    'syncFutureDays',
    'agendaDays',
    'icsFeeds',
    'profiles',
    'activeProfile',
    'taskBoards',
  ];
  const toSave = {};
  for (const k of allowed) {
    if (k in req.body) toSave[k] = req.body[k];
  }

  if ('syncFutureDays' in toSave) {
    toSave.syncFutureDays = normalizeSyncFutureDays(toSave.syncFutureDays);
  }
  if ('taskBoards' in toSave) {
    toSave.taskBoards = normalizeTaskBoards(toSave.taskBoards);
  }

  if (toSave.enabledViews?.length === 0) {
    return res.status(400).json({ error: 'enabledViews must not be empty' });
  }

  // Enforce max 5 tabs total (calendar views + tasks tab)
  const calViewCount =
    toSave.enabledViews?.length ?? readOverrides().enabledViews?.length ?? ALL_VIEWS.length;
  const tasksEnabled =
    'enableTasksView' in toSave
      ? toSave.enableTasksView
      : (readOverrides().enableTasksView ?? false);
  if (calViewCount + (tasksEnabled ? 1 : 0) > 5) {
    return res.status(400).json({ error: 'Maximum 5 navigation tabs allowed' });
  }

  // 'tasks' is a valid default when the tasks tab is enabled, even though it
  // lives outside enabledViews (which only holds calendar views).
  if (
    toSave.enabledViews &&
    toSave.defaultView &&
    !toSave.enabledViews.includes(toSave.defaultView) &&
    !(toSave.defaultView === 'tasks' && tasksEnabled)
  ) {
    toSave.defaultView = toSave.enabledViews[0];
  }

  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    // Merge with existing overrides so unrelated keys are preserved
    const existing = readOverrides();
    const merged = { ...existing, ...toSave };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
// app.js mounts the router itself; the normalizer rides along so tests can pin
// the 0-means-unlimited contract without standing up an HTTP server.
module.exports.normalizeSyncFutureDays = normalizeSyncFutureDays;
module.exports.normalizeTaskBoards = normalizeTaskBoards;
