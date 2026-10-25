const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Bearer tokens for native clients that cannot follow the SSO login, such as
// the Glance widget. Only a SHA-256 of each token is kept: the token itself is
// shown once, when it is created, and a leaked tokens.json opens nothing.
const TOKENS_FILE = process.env.NODECAL_TOKENS_FILE || '/config/tokens.json';

/**
 * @typedef {object} TokenRecord
 * @property {string} id
 * @property {string} label
 * @property {string} hash - hex SHA-256 of the token
 * @property {string} createdAt
 * @property {string|null} lastUsedAt
 */

/** @returns {TokenRecord[]} */
function readTokens() {
  try {
    const data = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    if (Array.isArray(data.tokens)) return data.tokens;
  } catch {
    /* no tokens yet */
  }
  return [];
}

/** @param {TokenRecord[]} tokens */
function writeTokens(tokens) {
  fs.mkdirSync(path.dirname(TOKENS_FILE), { recursive: true });
  fs.writeFileSync(TOKENS_FILE, JSON.stringify({ tokens }, null, 2), 'utf8');
}

/** @param {string} token */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** The listing Settings shows: never the hash. */
function listTokens() {
  const list = [];
  for (const record of readTokens()) {
    list.push({
      id: record.id,
      label: record.label,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
    });
  }
  return list;
}

/**
 * @param {string} label
 * @returns {{ id: string, label: string, token: string }} the only time the token is returned
 */
function createToken(label) {
  const token = `ncl_${crypto.randomBytes(32).toString('base64url')}`;
  const record = {
    id: crypto.randomBytes(6).toString('hex'),
    label:
      String(label || '')
        .trim()
        .slice(0, 60) || 'Integration',
    hash: hashToken(token),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  writeTokens([...readTokens(), record]);
  return { id: record.id, label: record.label, token };
}

/** @param {string} id @returns {boolean} whether a token was removed */
function revokeToken(id) {
  const tokens = readTokens();
  const kept = tokens.filter((record) => record.id !== id);
  if (kept.length === tokens.length) return false;
  writeTokens(kept);
  return true;
}

/**
 * The record a presented token belongs to, stamping when it was last used.
 * @param {string} token
 * @returns {TokenRecord|null}
 */
function verifyToken(token) {
  if (!token) return null;
  const presented = Buffer.from(hashToken(token), 'hex');
  const tokens = readTokens();
  for (const record of tokens) {
    const stored = Buffer.from(record.hash, 'hex');
    if (stored.length !== presented.length || !crypto.timingSafeEqual(stored, presented)) continue;
    record.lastUsedAt = new Date().toISOString();
    try {
      writeTokens(tokens);
    } catch {
      /* the stamp is informational; a read-only disk must not lock the client out */
    }
    return record;
  }
  return null;
}

module.exports = { listTokens, createToken, revokeToken, verifyToken };
