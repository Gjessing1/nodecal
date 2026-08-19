const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const { syncIncremental } = require('./caldav/sync');
const store = require('./cache/store');
const { authMiddleware } = require('./middleware/auth');
const { getBuildInfo } = require('./buildInfo');
const { startPushScheduler } = require('./push/scheduler');
const { registerAppReleaseRoutes } = require('./appRelease');

const app = express();
app.use(express.json());

// The service worker is served with the build id and full asset list baked in,
// so its bytes change on every deploy that touches client code — that byte
// difference is what triggers the browser's update flow. Registered before
// express.static so this wins over the raw template file in public/.
const swTemplate = fs.readFileSync(path.join(__dirname, '../public/service-worker.js'), 'utf8');
app.get('/service-worker.js', (req, res) => {
  const { buildId, assets } = getBuildInfo();
  res.type('application/javascript');
  res.set('Cache-Control', 'no-cache');
  res.send(
    `self.__BUILD__ = ${JSON.stringify(buildId)};\nself.__ASSETS__ = ${JSON.stringify(assets)};\n${swTemplate}`,
  );
});

// index.html must always be revalidated so browsers without the service worker
// (or before it takes control) never sit on a stale shell.
function setStaticHeaders(res, filePath) {
  if (filePath.endsWith('index.html')) res.set('Cache-Control', 'no-cache');
}
app.use(express.static(path.join(__dirname, '../public'), { setHeaders: setStaticHeaders }));
app.use('/client', express.static(path.join(__dirname, '../client')));
// Serve rrule UMD bundle — the ESM build uses bare specifiers that browsers can't resolve
app.use('/rrule', express.static(path.join(__dirname, '../node_modules/rrule/dist/es5')));

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
    build: getBuildInfo().buildId,
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
  try {
    await syncIncremental();
  } catch (err) {
    console.error('Initial sync failed (serving cached data):', err.message);
    store.setSyncState({ error: err.message });
  }

  app.listen(config.app.port, () => {
    console.log(`Nodecal running on port ${config.app.port} (build ${getBuildInfo().buildId})`);
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
