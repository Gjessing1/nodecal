const fs = require('fs');
const config = require('../config');
const { parseIcs } = require('../caldav/parser');

const SETTINGS_FILE = '/config/settings.json';

/**
 * Return the configured ICS subscription feeds from settings.json.
 * Each feed is { id, name, url, color }. `id` is a stable synthetic
 * calendar id supplied by the client (e.g. "ics:work").
 * @returns {Array<{id, name, url, color}>}
 */
function getIcsFeeds() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    if (Array.isArray(s.icsFeeds)) {
      return s.icsFeeds.filter(f => f && f.id && f.url);
    }
  } catch { /* no override file */ }
  return [];
}

/**
 * Fetch and parse a single ICS feed into Nodecal event objects.
 * Feed events are read-only: tagged with the feed's synthetic calendarId,
 * readOnly:true and href:null (no CalDAV write path). UIDs are namespaced
 * with the feed id so they can never collide with CalDAV event UIDs in the store.
 *
 * @param {{id, name, url, color}} feed
 * @returns {Promise<Array>} parsed event objects
 */
async function fetchFeed(feed) {
  const res = await fetch(feed.url, { headers: { 'Accept': 'text/calendar, */*' } });
  if (!res.ok) throw new Error(`ICS feed ${feed.id} GET failed: ${res.status}`);
  const text = await res.text();
  const events = [];
  for (const ev of parseIcs(text, { timezone: config.app.timezone })) {
    events.push({
      ...ev,
      uid: `${feed.id}::${ev.uid}`,
      calendarId: feed.id,
      readOnly: true,
      href: null,
      etag: null,
    });
  }
  return events;
}

module.exports = { getIcsFeeds, fetchFeed };
