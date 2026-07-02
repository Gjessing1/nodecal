// Web-push persistence: VAPID keypair and per-device subscriptions live in
// /config (survives container rebuilds alongside settings.json).
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const KEYS_FILE = '/config/push.json';
const SUBS_FILE = '/config/push-subscriptions.json';

let cachedKeys = null;

/** @returns {{ publicKey: string, privateKey: string }} */
function getVapidKeys() {
  if (cachedKeys) return cachedKeys;
  try {
    cachedKeys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    return cachedKeys;
  } catch {
    /* first run — generate below */
  }
  cachedKeys = webpush.generateVAPIDKeys();
  try {
    fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
    fs.writeFileSync(KEYS_FILE, JSON.stringify(cachedKeys, null, 2), 'utf8');
  } catch (err) {
    // Dev machines without /config: keys stay in-memory, so subscriptions
    // break on restart. Fine for development, never happens in the container.
    console.warn('Push: could not persist VAPID keys:', err.message);
  }
  return cachedKeys;
}

/** @returns {Array<{ endpoint: string, keys: object, userAgent?: string, createdAt?: string }>} */
function getSubscriptions() {
  try {
    return JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveSubscriptions(subs) {
  try {
    fs.mkdirSync(path.dirname(SUBS_FILE), { recursive: true });
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), 'utf8');
  } catch (err) {
    console.warn('Push: could not persist subscriptions:', err.message);
  }
}

function addSubscription(subscription, userAgent) {
  const subs = getSubscriptions().filter((s) => s.endpoint !== subscription.endpoint);
  subs.push({ ...subscription, userAgent: userAgent || '', createdAt: new Date().toISOString() });
  saveSubscriptions(subs);
}

function removeSubscription(endpoint) {
  const subs = getSubscriptions();
  const remaining = subs.filter((s) => s.endpoint !== endpoint);
  if (remaining.length !== subs.length) saveSubscriptions(remaining);
}

module.exports = { getVapidKeys, getSubscriptions, addSubscription, removeSubscription };
