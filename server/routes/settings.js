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
    siteTitle:    config.app.siteTitle,
    defaultView:  config.app.defaultView,
    timeFormat:   config.app.timeFormat,
    weekStart:    config.app.weekStart,
    timezone:     config.app.timezone,
    enabledViews: ALL_VIEWS,
    authEnabled:  !!config.app.appPassword,
    ...overrides,
  });
});

router.put('/settings', (req, res) => {
  const allowed = ['defaultView', 'timeFormat', 'weekStart', 'enabledViews', 'defaultCalendar'];
  const toSave = {};
  for (const k of allowed) {
    if (k in req.body) toSave[k] = req.body[k];
  }

  // Ensure enabledViews has at least one entry and defaultView is in it
  if (toSave.enabledViews?.length === 0) {
    return res.status(400).json({ error: 'enabledViews must not be empty' });
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
