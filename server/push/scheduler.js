// Server-side reminder delivery over Web Push (maily convergence step 6).
// The client's setTimeout reminders die as soon as the phone suspends the PWA;
// this scheduler runs a minute tick against the synced cache and pushes event
// alarms + task reminders to every subscribed device, so reminders arrive with
// the app closed.
const fs = require('fs');
const webpush = require('web-push');
const store = require('../cache/store');
const { expandRecurring } = require('../caldav/recurrence');
const pushStore = require('./store');

const SETTINGS_FILE = '/config/settings.json';
const SENT_FILE = '/cache/push-sent.json';
const TICK_MS = 60 * 1000;
// Send reminders missed by up to this much (container restarts, sync delays).
const GRACE_MS = 10 * 60 * 1000;
const LOOKAHEAD_MS = 48 * 60 * 60 * 1000;

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

// ── Alarm computation ───────────────────────────────────────────────────────

/**
 * Same semantics as the client's reminder scheduling (main.js): interpret a
 * wall-clock time on a date as local time in `tz` and return the UTC instant.
 */
function localTimeToUtc(dateStr, timeStr, tz) {
  const [h, m] = timeStr.split(':').map(Number);
  const naive = new Date(
    `${dateStr}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`,
  );
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(naive))
    parts[p.type] = p.value;
  const hh = parts.hour === '24' ? '00' : parts.hour;
  const shownAsUtc = new Date(
    `${parts.year}-${parts.month}-${parts.day}T${hh}:${parts.minute}:${parts.second}Z`,
  );
  return new Date(naive.getTime() + (naive.getTime() - shownAsUtc.getTime()));
}

/** @returns {Date|null} when the reminder for a task should fire */
function taskAlarmDatetime(dueStr, reminderType, cfg) {
  if (!dueStr || !reminderType || reminderType === 'none') return null;
  const tz = cfg.timezone || 'UTC';
  const morningTime = cfg.taskReminderMorningTime || '09:00';
  const eveningTime = cfg.taskReminderEveningTime || '18:00';
  let dateStr = dueStr;
  let timeStr = morningTime;
  if (reminderType === 'evening-before') {
    const d = new Date(dueStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    dateStr = d.toISOString().slice(0, 10);
    timeStr = eveningTime;
  } else if (reminderType === 'morning-before') {
    const d = new Date(dueStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    dateStr = d.toISOString().slice(0, 10);
  } else if (reminderType === 'evening-due') {
    timeStr = eveningTime;
  } else if (reminderType.startsWith('custom-')) {
    // custom-Xh: X hours before the morning time on the due date
    const hours = parseInt(reminderType.replace('custom-', '').replace('h', '')) || 0;
    const base = taskAlarmDatetime(dueStr, 'on-due', cfg);
    return base ? new Date(base.getTime() - hours * 3600000) : null;
  }
  return localTimeToUtc(dateStr, timeStr, tz);
}

/**
 * Collect every reminder whose fire-time falls in (now - GRACE, now].
 * @returns {Array<{ key: string, title: string, body: string, tag: string }>}
 */
function collectDue(now, cfg) {
  const due = [];
  const from = new Date(now - GRACE_MS);
  const to = new Date(now + LOOKAHEAD_MS);
  const tz = cfg.timezone || 'UTC';

  const events = [...store.getNonRecurringInRange(from, to)];
  for (const base of store.getRecurringBases()) events.push(...expandRecurring(base, from, to));

  for (const ev of events) {
    if (!ev.alarmMinutes || ev.allDay) continue;
    const alarmAt = new Date(ev.start).getTime() - ev.alarmMinutes * 60000;
    if (alarmAt > now || alarmAt <= now - GRACE_MS) continue;
    const timeStr = new Date(ev.start).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: cfg.timeFormat === '12h',
      timeZone: tz,
    });
    const id = ev.occurrenceDate ? `${ev.uid}-${ev.occurrenceDate}` : ev.uid;
    due.push({ key: `ev-${id}-${alarmAt}`, title: ev.title, body: timeStr, tag: `ev-${id}` });
  }

  for (const task of store.getTasks()) {
    if (task.status === 'COMPLETED' || !task.taskReminder || task.taskReminder === 'none') continue;
    const alarmAt = taskAlarmDatetime(task.due, task.taskReminder, cfg)?.getTime();
    if (!alarmAt || alarmAt > now || alarmAt <= now - GRACE_MS) continue;
    due.push({
      key: `task-${task.uid}-${alarmAt}`,
      title: task.title,
      body: `Due: ${task.due}`,
      tag: `task-${task.uid}`,
    });
  }
  return due;
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
  const due = collectDue(Date.now(), cfg);
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

module.exports = { startPushScheduler, taskAlarmDatetime, collectDue };
