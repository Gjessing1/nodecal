const { Router } = require('express');
const store = require('../cache/store');
const config = require('../config');
const { occurrencesInRange } = require('../caldav/occurrences');
const { readSettings } = require('../push/scheduler');
const { agendaHours, agendaWindow, buildAgenda } = require('../integrations/agenda');
const { verifyToken } = require('../integrations/tokens');

// Mounted ahead of the session gate and exempt from SSO in Caddy: the Glance
// widget refreshes from a background job that has no cookie and cannot follow
// a login redirect. A bearer token from Settings → Integrations is the only key.
const router = Router();

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireToken(req, res, next) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (!match || !verifyToken(match[1])) {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.get('/glance/agenda', requireToken, (req, res) => {
  const now = new Date();
  const hours = agendaHours(req.query.hours);
  const { from, to } = agendaWindow(now, hours);
  res.set('Cache-Control', 'no-store');
  res.json(
    buildAgenda({
      now,
      hours,
      occurrences: occurrencesInRange(from, to),
      calendars: store.getCalendars(),
      settings: readSettings(),
      timezone: config.app.timezone,
    }),
  );
});

module.exports = router;
