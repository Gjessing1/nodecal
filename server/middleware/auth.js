const crypto = require('crypto');
const fs = require('fs');
const config = require('../config');

const COOKIE_NAME = 'nodecal_session';
const SESSION_FILE = '/config/session.json';
const MAX_AGE_SECS = 30 * 24 * 60 * 60; // 30 days

let activeToken = null;

if (config.app.appPassword) {
  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    activeToken = data.token || null;
  } catch { /* no saved session */ }
}

function setActiveToken(token) {
  activeToken = token;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function saveToken(token) {
  try {
    fs.mkdirSync('/config', { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ token }), 'utf8');
  } catch { /* ignore — session just won't survive restarts */ }
}

function parseCookies(cookieHeader) {
  const out = {};
  for (const pair of (cookieHeader || '').split(';')) {
    const [k, ...v] = pair.trim().split('=');
    if (k) out[k.trim()] = v.join('=').trim();
  }
  return out;
}

function setCookie(res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${MAX_AGE_SECS}`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

function isAuthenticated(req) {
  if (!config.app.appPassword) return true;
  const cookies = parseCookies(req.headers.cookie);
  return !!activeToken && cookies[COOKIE_NAME] === activeToken;
}

function authMiddleware(req, res, next) {
  if (!config.app.appPassword) return next();
  if (req.path === '/login' || req.path === '/logout') return next();
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

module.exports = {
  authMiddleware, isAuthenticated,
  setActiveToken, generateToken, saveToken,
  setCookie, clearCookie,
};
