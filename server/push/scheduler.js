// Server-side reminder delivery over Web Push (maily convergence step 6).
// The client's setTimeout reminders die as soon as the phone suspends the PWA;
// this scheduler runs a minute tick against the synced cache and pushes event
// alarms + task reminders to every subscribed device, so reminders arrive with
// the app closed.
//
// What is due comes from ./reminders — the Android app arms local alarms from
// the same computation over a future window (server/routes/reminders.js).
const fs = require('fs');
const webpush = require('web-push');
const pushStore = require('./store');
const { collectReminders } = require('./reminders');

const SETTINGS_FILE = '/config/settings.json';
const SENT_FILE = '/cache/push-sent.json';
const TICK_MS = 60 * 1000;
// Send reminders missed by up to this much (container restarts, sync delays).
const GRACE_MS = 10 * 60 * 1000;

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// ── Sent-key dedupe, persisted so restarts can't double-send ───────────────

function loadSent() {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(SENT_FILE, 'utf8'))));
  } catch {
    return new Map();
  }
}

function saveSent(sent) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, ts] of sent) if (ts < cutoff) sent.delete(key);
  try {
    fs.writeFileSync(SENT_FILE, JSON.stringify(Object.fromEntries(sent)), 'utf8');
  } catch {
    /* dev machine without /cache — dedupe stays in-memory */
  }
}

// ── Delivery ────────────────────────────────────────────────────────────────

async function sendToAll(notification) {
  const { publicKey, privateKey } = pushStore.getVapidKeys();
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  const payload = JSON.stringify(notification);
  for (const sub of pushStore.getSubscriptions()) {
    try {
      await webpush.sendNotification(sub, payload, {
        vapidDetails: { subject, publicKey, privateKey },
      });
    } catch (err) {
      // 404/410 = the browser dropped the subscription (app uninstalled,
      // permission revoked) — forget it.
      if (err.statusCode === 404 || err.statusCode === 410) {
        pushStore.removeSubscription(sub.endpoint);
      } else {
        console.error('Push send failed:', err.message);
      }
    }
  }
}

async function tick() {
  if (pushStore.getSubscriptions().length === 0) return;
  const cfg = readSettings();
  const sent = loadSent();
  const now = Date.now();
  const due = collectReminders(new Date(now - GRACE_MS), new Date(now), cfg);
  let dirty = false;
  for (const n of due) {
    if (sent.has(n.key)) continue;
    sent.set(n.key, Date.now());
    dirty = true;
    await sendToAll({ title: n.title, body: n.body, tag: n.tag });
  }
  if (dirty) saveSent(sent);
}

function startPushScheduler() {
  setInterval(() => {
    tick().catch((err) => console.error('Push scheduler tick failed:', err.message));
  }, TICK_MS);
}

module.exports = { startPushScheduler, readSettings };
