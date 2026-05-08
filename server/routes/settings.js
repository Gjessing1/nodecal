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
    hiddenCategories:    [],
    ...overrides,
  });
});

router.put('/settings', (req, res) => {
  const allowed = [
    'defaultView', 'timeFormat', 'weekStart', 'enabledViews', 'defaultCalendar',
    'enableTasksView', 'showTasksOnCalendar', 'taskSortOrder', 'tasksCalDAVUrl',
    'hiddenCategories',
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

  if (toSave.enabledViews && toSave.defaultView && !toSave.enabledViews.includes(toSave.defaultView)) {
    toSave.defaultView = toSave.enabledViews[0];
  }

  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(toSave, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
