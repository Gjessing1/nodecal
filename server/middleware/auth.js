const crypto = require('crypto');
const fs = require('fs');
const config = require('../config');

const COOKIE_NAME = 'nodecal_session';
const SESSION_FILE = '/config/session.json';
const MAX_AGE_SECS = 180 * 24 * 60 * 60; // 180 days

let activeTokens = new Set();

// Load the persisted token set into memory, replacing the current set. The file
// is always the source of truth: every login/logout writes it after mutating
// memory, so it is never staler than memory. Re-reading on a cache miss lets a
// session minted by another process (or before this process started) be honored
// without a forced re-login.
function reloadTokensFromDisk() {
  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    const tokens = Array.isArray(data.tokens) ? data.tokens : (data.token ? [data.token] : []);
    activeTokens = new Set(tokens);
  } catch { /* no saved session */ }
}

if (config.app.appPassword) reloadTokensFromDisk();

function addActiveToken(token) {
  activeTokens.add(token);
}

function removeActiveToken(token) {
  activeTokens.delete(token);
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function saveTokens() {
  try {
    fs.mkdirSync('/config', { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify({ tokens: [...activeTokens] }), 'utf8');
  } catch { /* ignore — sessions just won't survive restarts */ }
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
  const token = cookies[COOKIE_NAME];
  if (!token) return false;
  if (activeTokens.has(token)) return true;
  // Miss: the persisted set may hold a session this process hasn't seen yet.
  reloadTokensFromDisk();
  return activeTokens.has(token);
}

function authMiddleware(req, res, next) {
  if (!config.app.appPassword) return next();
  if (req.path === '/login' || req.path === '/logout') return next();
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

module.exports = {
  authMiddleware, isAuthenticated,
  addActiveToken, removeActiveToken, generateToken, saveTokens,
  setCookie, clearCookie, parseCookies,
};
