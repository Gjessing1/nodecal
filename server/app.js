const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { syncIncremental } = require('./caldav/sync');
const store = require('./cache/store');
const { authMiddleware } = require('./middleware/auth');
const { getBuildId } = require('./buildId');
const { startPushScheduler } = require('./push/scheduler');
const { registerAppReleaseRoutes } = require('./appRelease');

const app = express();
app.use(express.json());

// HTML and the generated worker always revalidate. Vite's hashed bundles are
// immutable and can stay in the browser cache indefinitely.
function setStaticHeaders(res, filePath) {
  if (filePath.endsWith('index.html') || filePath.endsWith('service-worker.js')) {
    res.set('Cache-Control', 'no-cache');
  } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
}
app.use(express.static(path.join(__dirname, '../dist'), { setHeaders: setStaticHeaders }));

// Auth status — no auth required, used by client to gate API calls without 401 noise
const { isAuthenticated } = require('./middleware/auth');
app.get(['/auth/status', '/api/auth/status'], (req, res) =>
  res.json({ authenticated: isAuthenticated(req) }),
);

// APK metadata and download stay public: Android hands the download to the
// system browser, which does not share the app WebView's login cookie.
registerAppReleaseRoutes(app, config.app.androidAppDir);

// Auth middleware runs after static files so the login form always loads
app.use(authMiddleware);

const api = express.Router();
api.use(require('./routes/auth'));
api.use(require('./routes/events'));
api.use(require('./routes/calendars'));
api.use(require('./routes/sync'));
api.use(require('./routes/settings'));
api.use(require('./routes/nlp'));
api.use(require('./routes/tasks'));
api.use(require('./routes/weather'));
api.use(require('./routes/push'));
api.use(require('./routes/reminders'));

// Canonical namespace like maily's; the client and service worker use /api/*.
app.use('/api', api);
// Legacy root mount — installed PWAs run the pre-/api shell until their next
// update cycle. Remove once nothing hits the root paths anymore.
app.use(api);

function healthHandler(req, res) {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version,
    build: getBuildId(),
    ...store.getSyncState(),
  });
}
app.get(['/health', '/api/health'], healthHandler);

const SETTINGS_FILE = '/config/settings.json';
function getSyncIntervalMs() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    const min = parseInt(s.syncIntervalMinutes);
    if (min >= 1) return min * 60 * 1000;
  } catch {
    /* use default */
  }
  return 2 * 60 * 1000; // default 2 minutes
}

async function start() {
  const buildId = getBuildId();
  try {
    await syncIncremental();
  } catch (err) {
    console.error('Initial sync failed (serving cached data):', err.message);
    store.setSyncState({ error: err.message });
  }

  app.listen(config.app.port, () => {
    console.log(`Nodecal running on port ${config.app.port} (build ${buildId})`);
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

  // Web-push reminders — delivered even when every client is closed
  startPushScheduler();
}

start();
