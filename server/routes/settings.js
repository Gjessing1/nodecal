const { Router } = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const router = Router();
const SETTINGS_FILE = '/config/settings.json';
const ALL_VIEWS = ['agenda', 'day', 'week', 'month'];

function readOverrides() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); }
  catch { return {}; }
}

router.get('/settings', (req, res) => {
  const overrides = readOverrides();
  res.json({
    siteTitle:           config.app.siteTitle,
    defaultView:         config.app.defaultView,
    timeFormat:          config.app.timeFormat,
    weekStart:           config.app.weekStart,
    timezone:            config.app.timezone,
    enabledViews:        ALL_VIEWS,
    authEnabled:         !!config.app.appPassword,
    enableTasksView:     false,
    showTasksOnCalendar: false,
    taskSortOrder:       'due',
    tasksCalDAVUrl:      config.caldav.tasksUrl || '',
    hiddenCategories:       [],
    hiddenEventCategories:  [],
    icsFeeds:               [],
    activeProfile:          'personal',
    profiles: {
      personal: { name: 'Personal', hiddenCalendars: [], accentColor: '', defaultTaskSource: '', defaultView: '' },
      work:     { name: 'Work',     hiddenCalendars: [], accentColor: '', defaultTaskSource: '', defaultView: '' },
    },
    ...overrides,
  });
});

router.put('/settings', (req, res) => {
  const allowed = [
    'defaultView', 'timeFormat', 'weekStart', 'enabledViews', 'defaultCalendar',
    'enableTasksView', 'showTasksOnCalendar', 'taskSortOrder', 'tasksCalDAVUrl',
    'hiddenCategories', 'hiddenEventCategories', 'taskSources', 'defaultTaskSource',
    'defaultEventTime', 'defaultEventDuration', 'showWeekNumbers', 'dateFormat',
    'weatherLat', 'weatherLon', 'weatherDays', 'weatherDaysWeek', 'weatherDaysMonth', 'weatherDaysAgenda',
    'showWeekendBg',
    'showTasksOnDay', 'showTasksOnWeek', 'showTasksOnMonth', 'showTasksOnAgenda',
    'showWeekNumbersDay', 'showWeekNumbersMonth', 'showWeekNumbersAgenda',
    'enableNotifications', 'alarmDefaultMinutes', 'taskReminderDefault', 'taskReminderMorningTime', 'taskReminderEveningTime',
    'syncIntervalMinutes', 'syncHistoryDays', 'syncFutureDays', 'agendaDays',
    'icsFeeds', 'profiles', 'activeProfile',
  ];
  const toSave = {};
  for (const k of allowed) {
    if (k in req.body) toSave[k] = req.body[k];
  }

  if (toSave.enabledViews?.length === 0) {
    return res.status(400).json({ error: 'enabledViews must not be empty' });
  }

  // Enforce max 5 tabs total (calendar views + tasks tab)
  const calViewCount = toSave.enabledViews?.length ?? (readOverrides().enabledViews?.length ?? ALL_VIEWS.length);
  const tasksEnabled = 'enableTasksView' in toSave ? toSave.enableTasksView : (readOverrides().enableTasksView ?? false);
  if (calViewCount + (tasksEnabled ? 1 : 0) > 5) {
    return res.status(400).json({ error: 'Maximum 5 navigation tabs allowed' });
  }

  // 'tasks' is a valid default when the tasks tab is enabled, even though it
  // lives outside enabledViews (which only holds calendar views).
  if (toSave.enabledViews && toSave.defaultView
      && !toSave.enabledViews.includes(toSave.defaultView)
      && !(toSave.defaultView === 'tasks' && tasksEnabled)) {
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
