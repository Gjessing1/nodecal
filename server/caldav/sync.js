const {
  listCalendars, listEventEtags, fetchEventsByHref,
  getEffectiveTasksSources, listTaskEtags, fetchTasksByHref,
} = require('./client');
const store = require('../cache/store');
const config = require('../config');

function syncLog(msg) {
  if (config.app.debugSync) console.log(`[sync] ${msg}`);
}

const RANGE_PAST_DAYS   = 30;
const RANGE_FUTURE_DAYS = 90;

/**
 * Pure function — computes what to fetch and what to delete based on
 * the server's current etag list vs the local cache.
 *
 * @param {Array<{href, etag}>} serverEtags  - from listEventEtags()
 * @param {Array<{href, etag, uid}>} cached  - events already in cache for this calendar
 * @returns {{ toFetch: string[], toDelete: string[] }}
 */
function computeSyncDiff(serverEtags, cached) {
  const serverMap = new Map(serverEtags.map(e => [e.href, e.etag]));
  const toFetch  = [];
  const toDelete = [];

  for (const ev of cached) {
    if (!serverMap.has(ev.href)) toDelete.push(ev.uid);
  }

  for (const { href, etag } of serverEtags) {
    const local = cached.find(ev => ev.href === href);
    if (!local || local.etag !== etag) {
      syncLog(`etag mismatch: href=${href} local=${local?.etag || 'none'} server=${etag}`);
      toFetch.push(href);
    }
  }

  return { toFetch, toDelete };
}

/**
 * Retry a CalDAV call with exponential back-off.
 * @param {function(): Promise} fn
 * @param {number} retries
 * @param {number} delayMs  - base delay (doubled each attempt)
 */
async function withRetry(fn, retries = 3, delayMs = 2000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = delayMs * 2 ** attempt;
      console.log(`Sync attempt ${attempt + 1} failed (${err.message}). Retrying in ${wait}ms…`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

/**
 * Incremental sync.  Skips calendars whose ctag hasn't changed; for
 * changed calendars fetches only the events whose etag differs.
 * Falls back to full-fetch on first run (no stored ctags yet).
 */
async function syncIncremental() {
  const now  = new Date();
  const from = new Date(now.getTime() - RANGE_PAST_DAYS * 86400000);
  const to   = new Date(now.getTime() + RANGE_FUTURE_DAYS * 86400000);

  const calendars = await withRetry(() => listCalendars());
  store.setCalendars(calendars);

  let totalChanged = 0;

  for (const cal of calendars) {
    const storedCtag = store.getCalendarCtag(cal.id);

    if (cal.ctag && cal.ctag === storedCtag) {
      continue; // nothing changed in this calendar
    }

    const serverEtags  = await withRetry(() => listEventEtags(cal.href, from, to));
    const cachedEvents = store.getEventsByCalendar(cal.id);
    const { toFetch, toDelete } = computeSyncDiff(serverEtags, cachedEvents);

    // Fetch updated/new events BEFORE modifying the store so that a concurrent
    // GET /events request never sees a partially-updated calendar (missing both
    // the deleted events and the not-yet-added replacements).
    let fetchedEvents = [];
    if (toFetch.length > 0) {
      fetchedEvents = await withRetry(() => fetchEventsByHref(cal.href, toFetch));
    }

    // Apply deletes and additions atomically (no awaits below this point)
    for (const uid of toDelete) {
      store.removeEventSilent(uid);
      totalChanged++;
    }
    for (const ev of fetchedEvents) {
      const existing = store.getEvent(ev.uid);
      if (existing?.localModifiedAt) {
        syncLog(`server overwrites local edit: uid=${ev.uid} localModifiedAt=${existing.localModifiedAt}`);
      }
      syncLog(`fetched remote change: uid=${ev.uid} href=${ev.href}`);
      store.setEventSilent({ ...ev, calendarId: cal.id, lastSyncedAt: now.toISOString() });
      totalChanged++;
    }

    store.setCalendarCtag(cal.id, cal.ctag);
  }

  let tasksChanged = 0;
  const taskSources = getEffectiveTasksSources();
  for (const src of taskSources) {
    tasksChanged += await syncTasksIncremental(src.url, src.name, now);
  }

  if (totalChanged + tasksChanged > 0) store.flushToDisk();

  const result = {
    calendars: calendars.length,
    events: store.getEventCount(),
    tasks: store.getTaskCount(),
    changed: totalChanged + tasksChanged,
  };
  store.setSyncState({ lastSync: now.toISOString(), error: null });
  console.log(`Sync: ${result.calendars} cals, ${result.events} events, ${result.tasks} tasks, ${result.changed} changed`);
  return result;
}

/**
 * Incremental task sync against a single VTODO collection.
 * @param {string} tasksUrl
 * @param {string} sourceName  display name of this source
 * @param {Date} now
 * @returns {Promise<number>} number of changes
 */
async function syncTasksIncremental(tasksUrl, sourceName, now) {
  const serverEtags = await withRetry(() => listTaskEtags(tasksUrl));
  // Only consider cached tasks that belong to this source
  const cached = store.getTasks().filter(t => !t.source || t.source === tasksUrl);
  const serverMap = new Map(serverEtags.map(e => [e.href, e.etag]));
  let changed = 0;

  const toDelete = [];
  for (const task of cached) {
    if (!serverMap.has(task.href)) toDelete.push(task.uid);
  }

  const toFetch = [];
  for (const { href, etag } of serverEtags) {
    const local = cached.find(t => t.href === href);
    if (!local || local.etag !== etag) {
      syncLog(`etag mismatch (task): href=${href} local=${local?.etag || 'none'} server=${etag}`);
      toFetch.push(href);
    }
  }

  // Fetch updated/new tasks BEFORE modifying the store so that a concurrent
  // GET /tasks request never sees a partially-updated list (missing both the
  // deleted tasks and the not-yet-added replacements).
  let fetched = [];
  if (toFetch.length > 0) {
    fetched = await withRetry(() => fetchTasksByHref(tasksUrl, toFetch));
  }

  // Apply deletes and additions atomically (no awaits below this point)
  for (const uid of toDelete) {
    store.removeTaskSilent(uid);
    changed++;
  }
  for (const task of fetched) {
    const existing = store.getTask(task.uid);
    if (existing?.localModifiedAt) {
      syncLog(`server overwrites local edit (task): uid=${task.uid} localModifiedAt=${existing.localModifiedAt}`);
    }
    syncLog(`fetched remote change (task): uid=${task.uid}`);
    store.setTaskSilent({ ...task, source: tasksUrl, sourceName, lastSyncedAt: now.toISOString() });
    changed++;
  }

  return changed;
}

module.exports = { syncIncremental, syncTasksIncremental, computeSyncDiff, withRetry };
