const { Router } = require('express');
const pushStore = require('../push/store');

const router = Router();

// Public VAPID key — the browser needs it to create a subscription.
router.get('/push/key', (req, res) => {
  res.json({ publicKey: pushStore.getVapidKeys().publicKey });
});

router.post('/push/subscribe', (req, res) => {
  const sub = req.body?.subscription;
  if (!sub?.endpoint || !sub?.keys) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  pushStore.addSubscription(sub, req.headers['user-agent']);
  res.json({ ok: true });
});

router.post('/push/unsubscribe', (req, res) => {
  const endpoint = req.body?.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  pushStore.removeSubscription(endpoint);
  res.json({ ok: true });
});

module.exports = router;
