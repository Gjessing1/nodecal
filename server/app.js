const express = require('express');
const path = require('path');
const config = require('./config');
const { syncAll } = require('./caldav/sync');
const store = require('./cache/store');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/client', express.static(path.join(__dirname, '../client')));

app.use(require('./routes/events'));
app.use(require('./routes/calendars'));
app.use(require('./routes/sync'));

app.get('/config', (req, res) => {
  res.json(config.app);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: process.env.npm_package_version, ...store.getSyncState() });
});

async function start() {
  try {
    await syncAll();
  } catch (err) {
    console.error('Initial sync failed (will serve cached data):', err.message);
    store.setSyncState({ error: err.message });
  }
  app.listen(config.app.port, () => {
    console.log(`Nodecal running on port ${config.app.port}`);
  });
}

start();
