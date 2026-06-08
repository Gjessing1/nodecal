const {
  listCalendars, listEventEtags, fetchEventsByHref,
  getEffectiveTasksSources, listTaskEtags, fetchTasksByHref,
} = require('./client');
const { getIcsFeeds, fetchFeed } = require('../ics/feed');
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

  // Append read-only ICS feed pseudo-calendars so GET /calendars and the
  // drawer list them alongside real CalDAV calendars.
  const feeds = getIcsFeeds();
  const feedCals = feeds.map(f => ({ id: f.id, href: null, name: f.name || f.id, color: f.color, readOnly: true }));
  store.setCalendars([...calendars, ...feedCals]);

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

  let feedsChanged = 0;
  const feedErrors = [];
  for (const feed of feeds) {
    try {
      feedsChanged += await syncIcsFeed(feed, now);
    } catch (err) {
      // Keep the last cached feed events; surface a non-blocking error.
      console.error(`ICS feed "${feed.name || feed.id}" sync failed:`, err.message);
      feedErrors.push(`${feed.name || feed.id}: ${err.message}`);
    }
  }

  if (totalChanged + tasksChanged + feedsChanged > 0) store.flushToDisk();

  const result = {
    calendars: calendars.length + feedCals.length,
    events: store.getEventCount(),
    tasks: store.getTaskCount(),
    changed: totalChanged + tasksChanged + feedsChanged,
  };
  store.setSyncState({ lastSync: now.toISOString(), error: feedErrors.length ? feedErrors.join('; ') : null });
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

/**
 * Sync a single read-only ICS feed. A feed is a whole-document export with no
 * per-event etags, so the feed's events are replaced wholesale: fetch + parse
 * first (network), then atomically remove the feed's old events and insert the
 * fresh ones — mirroring the "fetch before mutate" atomicity rule used above.
 *
 * @param {{id, name, url, color}} feed
 * @param {Date} now
 * @returns {Promise<number>} number of changes
 */
async function syncIcsFeed(feed, now) {
  // Fetch BEFORE mutating the store so a concurrent GET /events never sees an
  // emptied feed (old events removed, new ones not yet inserted).
  const fetched = await withRetry(() => fetchFeed(feed));

  // Skip the (whole-document) replace when nothing changed, so background syncs
  // don't churn the store or re-flush events.json every tick.
  const existing = store.getEventsByCalendar(feed.id);
  if (feedSignature(existing) === feedSignature(fetched)) return 0;

  // Apply removal + insertion atomically (no awaits below this point).
  for (const ev of existing) store.removeEventSilent(ev.uid);
  for (const ev of fetched) {
    store.setEventSilent({ ...ev, lastSyncedAt: now.toISOString() });
  }
  syncLog(`ics feed ${feed.id}: replaced ${existing.length} with ${fetched.length} events`);
  return existing.length + fetched.length;
}

/** Order-independent content signature for a feed's events (change detection). */
function feedSignature(events) {
  return events
    .map(e => `${e.uid}|${e.start}|${e.end}|${e.allDay}|${e.title}|${e.rrule || ''}|${e.location || ''}|${e.description || ''}`)
    .sort()
    .join('\n');
}

module.exports = { syncIncremental, syncTasksIncremental, syncIcsFeed, computeSyncDiff, withRetry };
