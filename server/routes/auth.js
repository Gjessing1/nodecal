const { Router } = require('express');
const config = require('../config');
const { setActiveToken, generateToken, saveToken, setCookie, clearCookie } = require('../middleware/auth');

const router = Router();

router.post('/login', (req, res) => {
  if (!config.app.appPassword) return res.json({ ok: true });
  const { password } = req.body;
  if (!password || password !== config.app.appPassword) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = generateToken();
  setActiveToken(token);
  saveToken(token);
  setCookie(res, token);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  setActiveToken(null);
  clearCookie(res);
  res.json({ ok: true });
});

module.exports = router;
