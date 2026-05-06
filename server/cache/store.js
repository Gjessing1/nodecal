const fs = require('fs');
const path = require('path');

const CACHE_FILE = '/cache/events.json';

/** @type {Map<string, object>} uid → event */
const events = new Map();
/** @type {Map<string, object>} uid → task */
const tasks = new Map();
let calendars = [];
let syncState = { lastSync: null, error: null };
/** @type {Object<string, string>} calendarId → ctag */
let calendarCtags = {};

function loadFromDisk() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Handle plain array (oldest format), {events, ctags}, and {events, tasks, ctags}
    const evList = Array.isArray(data) ? data : (data.events || []);
    for (const ev of evList) events.set(ev.uid, ev);
    if (!Array.isArray(data)) {
      calendarCtags = data.ctags || {};
      for (const t of (data.tasks || [])) tasks.set(t.uid, t);
    }
    console.log(`Loaded ${events.size} events, ${tasks.size} tasks from cache`);
  } catch {
    // No cache file yet — start fresh
  }
}

function flushToDisk() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      events: Array.from(events.values()),
      tasks:  Array.from(tasks.values()),
      ctags:  calendarCtags,
    }), 'utf8');
  } catch (err) {
    console.error('Failed to persist cache:', err.message);
  }
}

// ── Calendars ─────────────────────────────────────────────
function getCalendars() { return calendars; }
function setCalendars(cals) { calendars = cals; }

// ── Ctags ─────────────────────────────────────────────────
function getCalendarCtag(calendarId) { return calendarCtags[calendarId] || null; }
function setCalendarCtag(calendarId, ctag) { calendarCtags[calendarId] = ctag; }

// ── Events ────────────────────────────────────────────────
function getEvent(uid) { return events.get(uid) || null; }
function getEventCount() { return events.size; }

function getEventsInRange(from, to) {
  const result = [];
  for (const ev of events.values()) {
    if (new Date(ev.start) < to && new Date(ev.end) > from) result.push(ev);
  }
  return result.sort((a, b) => new Date(a.start) - new Date(b.start));
}

function getNonRecurringInRange(from, to) {
  const result = [];
  for (const ev of events.values()) {
    if (!ev.rrule && new Date(ev.start) < to && new Date(ev.end) > from) result.push(ev);
  }
  return result;
}

function getRecurringBases() {
  return Array.from(events.values()).filter(ev => ev.rrule);
}

function getEventsByCalendar(calendarId) {
  return Array.from(events.values()).filter(ev => ev.calendarId === calendarId);
}

function getEventByHref(href) {
  for (const ev of events.values()) {
    if (ev.href === href) return ev;
  }
  return null;
}

function setEvent(event) { events.set(event.uid, event); flushToDisk(); }
function removeEvent(uid) { events.delete(uid); flushToDisk(); }
function setEventSilent(event) { events.set(event.uid, event); }
function removeEventSilent(uid) { events.delete(uid); }
function clearEvents() { events.clear(); }

// ── Tasks ─────────────────────────────────────────────────
function getTasks() { return Array.from(tasks.values()); }
function getTask(uid) { return tasks.get(uid) || null; }
function getTaskCount() { return tasks.size; }

function getTaskByHref(href) {
  for (const t of tasks.values()) {
    if (t.href === href) return t;
  }
  return null;
}

function setTask(task) { tasks.set(task.uid, task); flushToDisk(); }
function removeTask(uid) { tasks.delete(uid); flushToDisk(); }
function setTaskSilent(task) { tasks.set(task.uid, task); }
function removeTaskSilent(uid) { tasks.delete(uid); }

// ── Sync state ────────────────────────────────────────────
function getSyncState() { return syncState; }
function setSyncState(state) { syncState = { ...syncState, ...state }; }

loadFromDisk();

module.exports = {
  getCalendars, setCalendars,
  getCalendarCtag, setCalendarCtag,
  getEvent, getEventCount,
  getEventsInRange, getNonRecurringInRange, getRecurringBases,
  getEventsByCalendar, getEventByHref,
  setEvent, removeEvent, clearEvents,
  setEventSilent, removeEventSilent, flushToDisk,
  getTasks, getTask, getTaskCount, getTaskByHref,
  setTask, removeTask,
  setTaskSilent, removeTaskSilent,
  getSyncState, setSyncState,
};
