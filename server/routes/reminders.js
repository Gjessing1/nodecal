const { Router } = require('express');
const { collectReminders } = require('../push/reminders');
const { readSettings } = require('../push/scheduler');

const router = Router();

const DEFAULT_HOURS = 48;
const MAX_HOURS = 24 * 7;

// ── GET /reminders/upcoming ───────────────────────────────
//
// The schedule the Android app arms local alarms from. Android WebView has no
// Push API, so the app cannot receive the web-push reminders the same cache
// produces — it asks for the window ahead instead and fires them itself.
router.get('/reminders/upcoming', (req, res) => {
  const requested = parseInt(req.query.hours, 10);
  let hours = DEFAULT_HOURS;
  if (Number.isFinite(requested) && requested > 0) hours = Math.min(requested, MAX_HOURS);

  const now = new Date();
  const to = new Date(now.getTime() + hours * 60 * 60 * 1000);
  res.json({
    generatedAt: now.toISOString(),
    windowEnd: to.toISOString(),
    reminders: collectReminders(now, to, readSettings()),
  });
});

module.exports = router;
