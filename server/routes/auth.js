const { Router } = require('express');
const config = require('../config');
const { addActiveToken, removeActiveToken, generateToken, saveTokens, setCookie, clearCookie, parseCookies } = require('../middleware/auth');

const router = Router();

router.post('/login', (req, res) => {
  if (!config.app.appPassword || config.app.bypassAuth) return res.json({ ok: true });
  const { password } = req.body;
  if (!password || password !== config.app.appPassword) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = generateToken();
  addActiveToken(token);
  saveTokens();
  setCookie(res, token);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const COOKIE_NAME = 'nodecal_session';
  removeActiveToken(cookies[COOKIE_NAME]);
  saveTokens();
  clearCookie(res);
  res.json({ ok: true });
});

module.exports = router;
