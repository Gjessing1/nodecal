// Which reminders fall due inside a time window.
//
// This is the one place event alarms and task reminders are computed. Two very
// different callers read from it: the push scheduler asks about the window that
// just passed ("what did every closed browser miss?"), and the Android app asks
// about the window ahead ("what should I arm local alarms for?"). Sharing the
// walk is what keeps a reminder identical whichever way it reaches the phone.
const store = require('../cache/store');
const { expandRecurring } = require('../caldav/recurrence');

// An alarm fires before its event, so collecting alarms for a window means
// looking at events past the end of it. Nothing in the UI offers a lead longer
// than an hour; two days is headroom, not a limit anyone should tune.
const ALARM_LEAD_HEADROOM_MS = 48 * 60 * 60 * 1000;

/**
 * @typedef {object} Reminder
 * @property {string} key - Stable per fire-instant; the dedupe identity.
 * @property {string} tag - Notification tag, so a re-fire replaces rather than stacks.
 * @property {string} title
 * @property {string} body
 * @property {string} at - UTC ISO instant the reminder fires.
 * @property {'event'|'task'} kind
 * @property {string} targetId - API id of the event or task, for deep links.
 */

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

/** Every event in the window, recurring bases expanded into occurrences. */
function eventsForWindow(from, to) {
  const searchTo = new Date(to.getTime() + ALARM_LEAD_HEADROOM_MS);
  const events = [...store.getNonRecurringInRange(from, searchTo)];
  for (const base of store.getRecurringBases()) {
    events.push(...expandRecurring(base, from, searchTo));
  }
  return events;
}

/** @returns {Reminder|null} */
function eventReminder(ev, from, to, cfg) {
  if (!ev.alarmMinutes || ev.allDay) return null;
  const alarmAt = new Date(ev.start).getTime() - ev.alarmMinutes * 60000;
  if (alarmAt <= from.getTime() || alarmAt > to.getTime()) return null;

  const timeStr = new Date(ev.start).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: cfg.timeFormat === '12h',
    timeZone: cfg.timezone || 'UTC',
  });
  const tagId = ev.occurrenceDate ? `${ev.uid}-${ev.occurrenceDate}` : ev.uid;
  return {
    key: `ev-${tagId}-${alarmAt}`,
    tag: `ev-${tagId}`,
    title: ev.title,
    body: timeStr,
    at: new Date(alarmAt).toISOString(),
    kind: 'event',
    targetId: ev.id || ev.uid,
  };
}

/** @returns {Reminder|null} */
function taskReminder(task, from, to, cfg) {
  if (task.status === 'COMPLETED' || !task.taskReminder || task.taskReminder === 'none')
    return null;
  const alarmAt = taskAlarmDatetime(task.due, task.taskReminder, cfg)?.getTime();
  if (!alarmAt || alarmAt <= from.getTime() || alarmAt > to.getTime()) return null;
  return {
    key: `task-${task.uid}-${alarmAt}`,
    tag: `task-${task.uid}`,
    title: task.title,
    body: `Due: ${task.due}`,
    at: new Date(alarmAt).toISOString(),
    kind: 'task',
    targetId: task.uid,
  };
}

/**
 * Every reminder whose fire instant falls in (from, to], oldest first.
 * @param {Date} from - Exclusive lower bound.
 * @param {Date} to - Inclusive upper bound.
 * @param {Record<string, any>} cfg - settings.json
 * @returns {Reminder[]}
 */
function collectReminders(from, to, cfg) {
  const reminders = [];
  for (const ev of eventsForWindow(from, to)) {
    const reminder = eventReminder(ev, from, to, cfg);
    if (reminder) reminders.push(reminder);
  }
  for (const task of store.getTasks()) {
    const reminder = taskReminder(task, from, to, cfg);
    if (reminder) reminders.push(reminder);
  }
  reminders.sort((a, b) => a.at.localeCompare(b.at));
  return reminders;
}

module.exports = { collectReminders, taskAlarmDatetime };
