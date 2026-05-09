const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { syncIncremental } = require('./caldav/sync');
const store = require('./cache/store');
const { authMiddleware } = require('./middleware/auth');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/client', express.static(path.join(__dirname, '../client')));

// Auth middleware runs after static files so the login form always loads
app.use(authMiddleware);
app.use(require('./routes/auth'));
app.use(require('./routes/events'));
app.use(require('./routes/calendars'));
app.use(require('./routes/sync'));
app.use(require('./routes/settings'));
app.use(require('./routes/nlp'));
app.use(require('./routes/tasks'));
app.use(require('./routes/weather'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version, ...store.getSyncState() });
});

const SETTINGS_FILE = '/config/settings.json';
function getSyncIntervalMs() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    const min = parseInt(s.syncIntervalMinutes);
    if (min >= 1) return min * 60 * 1000;
  } catch { /* use default */ }
  return 2 * 60 * 1000; // default 2 minutes
}

async function start() {
  try {
    await syncIncremental();
  } catch (err) {
    console.error('Initial sync failed (serving cached data):', err.message);
    store.setSyncState({ error: err.message });
  }

  app.listen(config.app.port, () => {
    console.log(`Nodecal running on port ${config.app.port}`);
  });

  // Background auto-sync — interval read from settings on each tick (default 2 min)
  function scheduleSync() {
    setTimeout(async () => {
      try {
        await syncIncremental();
      } catch (err) {
        console.error('Background sync failed:', err.message);
        store.setSyncState({ error: err.message });
      }
      scheduleSync(); // reschedule with potentially updated interval
    }, getSyncIntervalMs());
  }
  scheduleSync();
}

start();
