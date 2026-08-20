const {
  listCalendars,
  listEventEtags,
  fetchEventsByHref,
  getEffectiveTasksSources,
  listTaskEtags,
  fetchTasksByHref,
} = require('./client');
const { getIcsFeeds, fetchFeed } = require('../ics/feed');
const { expandRecurring } = require('./recurrence');
const store = require('../cache/store');
const config = require('../config');
const fs = require('fs');

function syncLog(msg) {
  if (config.app.debugSync) console.log(`[sync] ${msg}`);
}

const SETTINGS_FILE = '/config/settings.json';
// The fallbacks match what the client asks for when the same keys are unset —
// `syncHistoryDays ?? 730` and `syncFutureDays || 0` in client/app/main.js. The
// sync window has to be at least as wide as the query the client makes against
// it, or the calendar shows gaps where nothing was ever fetched. They used to
// be 30 and 90, which is what made `Events history (days)` unable to mean 750.
const DEFAULT_PAST_DAYS = 730;
// syncFutureDays uses 0 for "no limit". A CalDAV time-range filter still needs
// a concrete end, so unlimited is capped at the same 10 years rangeTo() uses.
const NO_LIMIT_FUTURE_DAYS = 3650;

/**
 * How far back and forward to sync, from Settings ▸ Sync.
 *
 * These used to be hard-coded at 30/90, which quietly capped the pane's
 * `Events history (days)` — a value of 750 fetched 30. Read straight from the
 * settings file rather than over HTTP: sync runs on a timer inside the same
 * process, with no request to carry the config.
 * @returns {{pastDays: number, futureDays: number}}
 */
function readSyncWindowDays() {
  let overrides = {};
  try {
    overrides = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    // No settings file — the defaults below are the previous behaviour.
  }
  const past = Number(overrides.syncHistoryDays);
  const future = Number(overrides.syncFutureDays);
  return {
    pastDays: Number.isFinite(past) && past > 0 ? past : DEFAULT_PAST_DAYS,
    futureDays: Number.isFinite(future) && future > 0 ? future : NO_LIMIT_FUTURE_DAYS,
  };
}

/**
 * Does this cached record fall inside the window the server was asked about?
 *
 * Only records that do can be judged missing. A series is expanded rather than
 * range-checked on its start: an open-ended weekly event that began years ago
 * still overlaps today's window, and the server would have listed it.
 * @param {object} ev
 * @param {Date} from
 * @param {Date} to
 * @returns {boolean}
 */
function overlapsWindow(ev, from, to) {
  if (ev.rrule && !ev.recurrenceId) return expandRecurring(ev, from, to).length > 0;
  return new Date(ev.start) < to && new Date(ev.end) > from;
}

/**
 * Pure function — computes what to fetch and what to delete based on
 * the server's current etag list vs the local cache.
 *
 * Grouped by href, because one resource holds a whole series: a master plus an
 * override per edited occurrence. They share an href and an etag, so they are
 * fetched and dropped together.
 *
 * @param {Array<{href, etag}>} serverEtags  - from listEventEtags()
 * @param {Array<{href, etag, uid}>} cached  - events already in cache for this calendar
 * @param {Date} from - start of the window listEventEtags() was given
 * @param {Date} to   - end of that window
 * @returns {{ toFetch: string[], toDelete: string[] }} toDelete holds cache keys
 */
function computeSyncDiff(serverEtags, cached, from, to) {
  const serverMap = new Map(serverEtags.map((e) => [e.href, e.etag]));
  /** @type {Map<string, object[]>} */
  const byHref = new Map();
  for (const ev of cached) {
    const group = byHref.get(ev.href);
    if (group) group.push(ev);
    else byHref.set(ev.href, [ev]);
  }

  const toFetch = [];
  const toDelete = [];

  for (const [href, group] of byHref) {
    if (serverMap.has(href)) continue;
    // The etag listing is time-filtered, so absence only means "deleted" for
    // events inside that window. Treating every absence as a deletion is how
    // anything older than the window used to be erased on the next sync.
    if (!group.some((ev) => overlapsWindow(ev, from, to))) continue;
    for (const ev of group) toDelete.push(store.eventKey(ev));
  }

  for (const { href, etag } of serverEtags) {
    const group = byHref.get(href);
    if (!group || group.some((ev) => ev.etag !== etag)) {
      syncLog(`etag mismatch: href=${href} local=${group?.[0]?.etag || 'none'} server=${etag}`);
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
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/**
 * Incremental sync.  Skips calendars whose ctag hasn't changed; for
 * changed calendars fetches only the events whose etag differs.
 * Falls back to full-fetch on first run (no stored ctags yet).
 */
async function syncIncremental() {
  const now = new Date();
  const { pastDays, futureDays } = readSyncWindowDays();
  const from = new Date(now.getTime() - pastDays * 86400000);
  const to = new Date(now.getTime() + futureDays * 86400000);

  const calendars = await withRetry(() => listCalendars());

  // Append read-only ICS feed pseudo-calendars so GET /calendars and the
  // drawer list them alongside real CalDAV calendars.
  const feeds = getIcsFeeds();
  const feedCals = feeds.map((f) => ({
    id: f.id,
    href: null,
    name: f.name || f.id,
    color: f.color,
    readOnly: true,
  }));
  store.setCalendars([...calendars, ...feedCals]);

  let totalChanged = 0;

  for (const cal of calendars) {
    const storedCtag = store.getCalendarCtag(cal.id);

    if (cal.ctag && cal.ctag === storedCtag) {
      continue; // nothing changed in this calendar
    }

    const serverEtags = await withRetry(() => listEventEtags(cal.href, from, to));
    const cachedEvents = store.getEventsByCalendar(cal.id);
    const { toFetch, toDelete } = computeSyncDiff(serverEtags, cachedEvents, from, to);

    // Fetch updated/new events BEFORE modifying the store so that a concurrent
    // GET /events request never sees a partially-updated calendar (missing both
    // the deleted events and the not-yet-added replacements).
    let fetchedEvents = [];
    if (toFetch.length > 0) {
      fetchedEvents = await withRetry(() => fetchEventsByHref(cal.href, toFetch));
    }

    // Apply deletes and additions atomically (no awaits below this point)
    for (const key of toDelete) {
      store.removeEventSilent(key);
      totalChanged++;
    }
    // Clear each re-fetched resource before re-adding it: a series that lost an
    // override still returns the same href, and nothing else would drop the
    // stale override record. What was there is kept aside first — the
    // local-edit warning below needs the record this fetch is replacing.
    const replaced = new Map();
    for (const href of new Set(fetchedEvents.map((ev) => ev.href))) {
      for (const ev of store.getEventsByHref(href)) replaced.set(store.eventKey(ev), ev);
      store.removeEventsByHrefSilent(href);
    }
    for (const ev of fetchedEvents) {
      const existing = replaced.get(store.eventKey(ev));
      if (existing?.localModifiedAt) {
        syncLog(
          `server overwrites local edit: uid=${ev.uid} localModifiedAt=${existing.localModifiedAt}`,
        );
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
  store.setSyncState({
    lastSync: now.toISOString(),
    error: feedErrors.length ? feedErrors.join('; ') : null,
  });
  console.log(
    `Sync: ${result.calendars} cals, ${result.events} events, ${result.tasks} tasks, ${result.changed} changed`,
  );
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
  const cached = store.getTasks().filter((t) => !t.source || t.source === tasksUrl);
  const serverMap = new Map(serverEtags.map((e) => [e.href, e.etag]));
  let changed = 0;

  const toDelete = [];
  for (const task of cached) {
    if (!serverMap.has(task.href)) toDelete.push(task.uid);
  }

  const toFetch = [];
  for (const { href, etag } of serverEtags) {
    const local = cached.find((t) => t.href === href);
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
      syncLog(
        `server overwrites local edit (task): uid=${task.uid} localModifiedAt=${existing.localModifiedAt}`,
      );
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
    .map(
      (e) =>
        `${e.uid}|${e.start}|${e.end}|${e.allDay}|${e.title}|${e.rrule || ''}|${e.location || ''}|${e.description || ''}`,
    )
    .sort()
    .join('\n');
}

module.exports = { syncIncremental, syncTasksIncremental, syncIcsFeed, computeSyncDiff, withRetry };
