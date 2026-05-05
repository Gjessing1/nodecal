const { listCalendars, listEvents } = require('./client');
const store = require('../cache/store');

const RANGE_PAST_DAYS = 30;
const RANGE_FUTURE_DAYS = 90;

/**
 * Full sync: fetch all calendars and their events, replace the cache.
 * Phase 6 will make this incremental via etag/ctag.
 */
async function syncAll() {
  const now = new Date();
  const from = new Date(now.getTime() - RANGE_PAST_DAYS * 86400000);
  const to = new Date(now.getTime() + RANGE_FUTURE_DAYS * 86400000);

  const calendars = await listCalendars();
  store.setCalendars(calendars);
  store.clearEvents();

  for (const cal of calendars) {
    const events = await listEvents(cal.href, from, to);
    for (const ev of events) {
      store.setEvent({ ...ev, calendarId: cal.id });
    }
  }

  const result = { calendars: calendars.length, events: store.getEventCount() };
  store.setSyncState({ lastSync: now.toISOString(), error: null });
  console.log(`Sync complete: ${result.calendars} calendars, ${result.events} events`);
  return result;
}

module.exports = { syncAll };
