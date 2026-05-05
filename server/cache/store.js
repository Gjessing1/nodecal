const fs = require('fs');
const path = require('path');

const CACHE_FILE = '/cache/events.json';

/** @type {Map<string, object>} uid → event */
const events = new Map();
let calendars = [];
let syncState = { lastSync: null, error: null };

function loadFromDisk() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    for (const ev of JSON.parse(raw)) {
      events.set(ev.uid, ev);
    }
    console.log(`Loaded ${events.size} events from cache`);
  } catch {
    // No cache file yet — start fresh
  }
}

function flushToDisk() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(Array.from(events.values())), 'utf8');
  } catch (err) {
    console.error('Failed to persist event cache:', err.message);
  }
}

function getCalendars() { return calendars; }
function setCalendars(cals) { calendars = cals; }

function getEvent(uid) { return events.get(uid) || null; }
function getEventCount() { return events.size; }

function getEventsInRange(from, to) {
  const result = [];
  for (const ev of events.values()) {
    if (new Date(ev.start) < to && new Date(ev.end) > from) result.push(ev);
  }
  return result.sort((a, b) => new Date(a.start) - new Date(b.start));
}

function setEvent(event) {
  events.set(event.uid, event);
  flushToDisk();
}

function removeEvent(uid) {
  events.delete(uid);
  flushToDisk();
}

function clearEvents() { events.clear(); }

function bulkSetEvents(evList) {
  for (const ev of evList) events.set(ev.uid, ev);
  flushToDisk();
}

function getSyncState() { return syncState; }
function setSyncState(state) { syncState = { ...syncState, ...state }; }

loadFromDisk();

module.exports = {
  getCalendars, setCalendars,
  getEvent, getEventCount, getEventsInRange,
  setEvent, removeEvent, clearEvents, bulkSetEvents,
  getSyncState, setSyncState,
};
