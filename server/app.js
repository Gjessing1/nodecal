const express = require('express');
const path = require('path');
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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version, ...store.getSyncState() });
});

const BACKGROUND_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

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

  // Background auto-sync — runs every 5 minutes after startup
  setInterval(async () => {
    try {
      await syncIncremental();
    } catch (err) {
      console.error('Background sync failed:', err.message);
      store.setSyncState({ error: err.message });
    }
  }, BACKGROUND_INTERVAL_MS);
}

start();
