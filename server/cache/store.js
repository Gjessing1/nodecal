const fs = require('fs');
const path = require('path');
const { parseCategories } = require('../caldav/parser');

const CACHE_FILE = '/cache/events.json';

/** @type {Map<string, object>} event key (see eventKey) → event */
const events = new Map();

/**
 * The cache key for an event record.
 *
 * A recurring series whose occurrences have been individually edited arrives as
 * several VEVENTs in one resource: the master, plus one override per edited
 * occurrence. They all share the UID and are told apart only by RECURRENCE-ID.
 * Keying on UID alone let the last one win, which silently destroyed the master
 * — and with it the whole series, since getRecurringBases() filters on `rrule`.
 * @param {{uid: string, recurrenceId?: string|null}} ev
 * @returns {string}
 */
function eventKey(ev) {
  if (!ev.recurrenceId) return ev.uid;
  return `${ev.uid}::${ev.recurrenceId}`;
}
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
    const evList = Array.isArray(data) ? data : data.events || [];
    for (const ev of evList) events.set(eventKey(ev), ev);
    if (!Array.isArray(data)) {
      calendarCtags = data.ctags || {};
      for (const t of data.tasks || []) tasks.set(t.uid, t);
    }
    dropOrphanedOverrides();
    dropVendorCategories();
    console.log(`Loaded ${events.size} events, ${tasks.size} tasks from cache`);
  } catch {
    // No cache file yet — start fresh
  }
}

/**
 * Heal caches written while the key was the bare UID.
 *
 * Back then an override overwrote its own master and the series was lost. Such
 * a record is recognisable now: an override whose master is not in the cache.
 * Its etag still matches the server's, so no sync would ever re-fetch it —
 * dropping it leaves the href uncached, which is what makes the next sync pull
 * the whole resource back, master included.
 */
function dropOrphanedOverrides() {
  let dropped = 0;
  for (const [key, ev] of events) {
    if (!ev.recurrenceId) continue;
    if (events.has(ev.uid)) continue;
    events.delete(key);
    dropped++;
  }
  if (dropped > 0) {
    console.log(`Dropped ${dropped} orphaned occurrence override(s); next sync re-fetches them`);
  }
}

/**
 * Re-apply the category filter to records cached before it existed.
 *
 * A Google-exported item carries CATEGORIES:http://schemas.google.com/... and
 * the parser now drops it, but a cached copy keeps it until its etag changes —
 * which for an old event may be never, so it would sit in the filter drawer
 * indefinitely.
 */
function dropVendorCategories() {
  let cleaned = 0;
  for (const record of [...events.values(), ...tasks.values()]) {
    const current = /** @type {any} */ (record).categories;
    if (!current?.length) continue;
    const kept = parseCategories(current.join(','));
    if (kept.length === current.length) continue;
    /** @type {any} */ (record).categories = kept;
    cleaned++;
  }
  // No flush: the in-memory records are what GET /events serves, and the file
  // catches up on the next write. Re-running this on the next load is harmless.
  if (cleaned > 0) {
    console.log(`Dropped vendor type markers from ${cleaned} cached record(s)`);
  }
}

function flushToDisk() {
  try {
    const dir = path.dirname(CACHE_FILE);
    fs.mkdirSync(dir, { recursive: true });
    const payload = JSON.stringify({
      events: Array.from(events.values()),
      tasks: Array.from(tasks.values()),
      ctags: calendarCtags,
    });
    const tmp = CACHE_FILE + '.tmp';
    fs.writeFileSync(tmp, payload, 'utf8');
    fs.renameSync(tmp, CACHE_FILE); // atomic on same filesystem — no partial writes on crash
  } catch (err) {
    console.error('Failed to persist cache:', err.message);
  }
}

// ── Calendars ─────────────────────────────────────────────
function getCalendars() {
  return calendars;
}
function setCalendars(cals) {
  calendars = cals;
}

// ── Ctags ─────────────────────────────────────────────────
function getCalendarCtag(calendarId) {
  return calendarCtags[calendarId] || null;
}
function setCalendarCtag(calendarId, ctag) {
  calendarCtags[calendarId] = ctag;
}

// ── Events ────────────────────────────────────────────────
function getEvent(uid) {
  return events.get(uid) || null;
}

/** Look up one record by its full cache key — an override needs its RECURRENCE-ID. */
function getEventByKey(key) {
  return events.get(key) || null;
}

/** Every modified-occurrence record, for GET /events to match against a series. */
function getOverrides() {
  return Array.from(events.values()).filter((ev) => ev.recurrenceId);
}

/** Every record belonging to one CalDAV resource: a master plus its overrides. */
function getEventsByHref(href) {
  return Array.from(events.values()).filter((ev) => ev.href === href);
}
function getEventCount() {
  return events.size;
}

function getEventsInRange(from, to) {
  const result = [];
  for (const ev of events.values()) {
    if (new Date(ev.start) < to && new Date(ev.end) > from) result.push(ev);
  }
  return result.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function getNonRecurringInRange(from, to) {
  const result = [];
  for (const ev of events.values()) {
    // Overrides are emitted by the recurring expansion instead, in place of the
    // occurrence they replace; returning them here too would double them up.
    if (ev.recurrenceId) continue;
    if (!ev.rrule && new Date(ev.start) < to && new Date(ev.end) > from) result.push(ev);
  }
  return result;
}

function getRecurringBases() {
  return Array.from(events.values()).filter((ev) => ev.rrule && !ev.recurrenceId);
}

function getAllEvents() {
  return Array.from(events.values());
}

function getEventsByCalendar(calendarId) {
  return Array.from(events.values()).filter((ev) => ev.calendarId === calendarId);
}

function getEventByHref(href) {
  for (const ev of events.values()) {
    if (ev.href === href) return ev;
  }
  return null;
}

function setEvent(event) {
  events.set(eventKey(event), event);
  flushToDisk();
}
function removeEvent(uid) {
  events.delete(uid);
  flushToDisk();
}
function setEventSilent(event) {
  events.set(eventKey(event), event);
}
/** @param {string} key - a cache key from eventKey(), not necessarily a bare uid */
function removeEventSilent(key) {
  events.delete(key);
}

/**
 * Drop every record of one resource. A CalDAV href holds the whole series, so
 * re-fetching it has to clear the old records first — otherwise an override the
 * user deleted elsewhere lingers here forever, since nothing else deletes it.
 * @param {string} href
 */
function removeEventsByHrefSilent(href) {
  for (const [key, ev] of events) {
    if (ev.href === href) events.delete(key);
  }
}
function clearEvents() {
  events.clear();
}

// ── Tasks ─────────────────────────────────────────────────
function getTasks() {
  return Array.from(tasks.values());
}
function getTask(uid) {
  return tasks.get(uid) || null;
}
function getTaskCount() {
  return tasks.size;
}

function getTaskByHref(href) {
  for (const t of tasks.values()) {
    if (t.href === href) return t;
  }
  return null;
}

function setTask(task) {
  tasks.set(task.uid, task);
  flushToDisk();
}
function removeTask(uid) {
  tasks.delete(uid);
  flushToDisk();
}
function setTaskSilent(task) {
  tasks.set(task.uid, task);
}
function removeTaskSilent(uid) {
  tasks.delete(uid);
}

// ── Sync state ────────────────────────────────────────────
function getSyncState() {
  return syncState;
}
function setSyncState(state) {
  syncState = { ...syncState, ...state };
}

loadFromDisk();

/** Clear all in-memory data and reset ctags so the next sync fetches everything fresh. */
function clearAll() {
  events.clear();
  tasks.clear();
  calendarCtags = {};
  calendars = [];
  syncState = { lastSync: null, error: null };
  // Remove the disk cache so it doesn't re-seed stale data on next restart
  try {
    fs.unlinkSync(CACHE_FILE);
  } catch {
    /* file may not exist */
  }
}

module.exports = {
  getCalendars,
  setCalendars,
  getCalendarCtag,
  setCalendarCtag,
  getEvent,
  getEventByKey,
  getOverrides,
  getEventsByHref,
  eventKey,
  getEventCount,
  getAllEvents,
  getEventsInRange,
  getNonRecurringInRange,
  getRecurringBases,
  getEventsByCalendar,
  getEventByHref,
  setEvent,
  removeEvent,
  clearEvents,
  setEventSilent,
  removeEventSilent,
  removeEventsByHrefSilent,
  flushToDisk,
  getTasks,
  getTask,
  getTaskCount,
  getTaskByHref,
  setTask,
  removeTask,
  setTaskSilent,
  removeTaskSilent,
  getSyncState,
  setSyncState,
  clearAll,
};
