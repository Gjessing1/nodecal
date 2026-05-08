const { Router } = require('express');
const { syncIncremental } = require('../caldav/sync');
const store = require('../cache/store');

const router = Router();

router.get('/sync', (req, res) => {
  res.json(store.getSyncState());
});

router.post('/sync', async (req, res) => {
  try {
    const result = await syncIncremental();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('POST /sync:', err.message);
    store.setSyncState({ error: err.message });
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Clear cache and re-sync from scratch (settings.json is untouched)
router.post('/sync/clear', async (req, res) => {
  try {
    store.clearAll();
    const result = await syncIncremental();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('POST /sync/clear:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

module.exports = router;
