const config = require('../config');
const { parseIcs } = require('./parser');

function getAuth() {
  return 'Basic ' + Buffer.from(`${config.caldav.username}:${config.caldav.password}`).toString('base64');
}

function fullUrl(href) {
  if (href.startsWith('http')) return href;
  const u = new URL(config.caldav.baseUrl);
  return u.origin + href;
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i'));
  return m ? m[1].trim() : null;
}

function extractAllTags(xml, tag) {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function unescapeXml(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

const PALETTE = ['#4a90d9','#7ed321','#d0021b','#f5a623','#50e3c2','#9b59b6','#e74c3c','#2ecc71'];
function paletteColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

async function davRequest(method, url, extraHeaders = {}, body = null) {
  return fetch(url, {
    method,
    headers: { 'Authorization': getAuth(), 'Content-Type': 'application/xml; charset=utf-8', ...extraHeaders },
    body,
  });
}

/**
 * Fetch all calendars for the configured user.
 * @returns {Promise<Array<{id, href, name, color}>>}
 */
async function listCalendars() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav" xmlns:ical="http://apple.com/ns/ical/">
  <d:prop><d:resourcetype /><d:displayname /><ical:calendar-color /></d:prop>
</d:propfind>`;

  const res = await davRequest('PROPFIND', config.caldav.baseUrl + '/', { 'Depth': '1' }, body);
  if (!res.ok && res.status !== 207) throw new Error(`PROPFIND failed: ${res.status}`);
  const xml = await res.text();

  const calendars = [];
  for (const block of extractAllTags(xml, 'response')) {
    const resourceType = extractTag(block, 'resourcetype') || '';
    if (!resourceType.includes('calendar')) continue;
    const href = extractTag(block, 'href');
    if (!href) continue;
    const name = extractTag(block, 'displayname') || href.split('/').filter(Boolean).pop() || 'Calendar';
    const rawColor = extractTag(block, 'calendar-color');
    const color = rawColor ? rawColor.slice(0, 7) : paletteColor(href);
    const url = fullUrl(href);
    calendars.push({ id: url, href: url, name, color });
  }
  return calendars;
}

/**
 * Fetch events from a calendar within a time range.
 * @returns {Promise<Array>}
 */
async function listEvents(calendarHref, from, to) {
  const url = fullUrl(calendarHref);
  const fmt = d => d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<cal:calendar-query xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag /><cal:calendar-data /></d:prop>
  <cal:filter>
    <cal:comp-filter name="VCALENDAR">
      <cal:comp-filter name="VEVENT">
        <cal:time-range start="${fmt(from)}" end="${fmt(to)}"/>
      </cal:comp-filter>
    </cal:comp-filter>
  </cal:filter>
</cal:calendar-query>`;

  const res = await davRequest('REPORT', url, { 'Depth': '1' }, body);
  if (res.status === 404) return [];
  if (!res.ok && res.status !== 207) throw new Error(`REPORT failed: ${res.status}`);
  const xml = await res.text();

  const events = [];
  for (const block of extractAllTags(xml, 'response')) {
    const href = extractTag(block, 'href');
    const etag = (extractTag(block, 'getetag') || '').replace(/"/g, '');
    const icsData = unescapeXml(extractTag(block, 'calendar-data') || '');
    if (!icsData) continue;
    for (const ev of parseIcs(icsData)) {
      events.push({ ...ev, href: fullUrl(href), etag });
    }
  }
  return events;
}

/**
 * Create or update an event on the server. Pass etag to update, omit to create.
 */
async function putEvent(calendarHref, uid, icsData, etag = null) {
  const base = fullUrl(calendarHref).replace(/\/?$/, '/');
  const url = base + uid + '.ics';
  const headers = { 'Authorization': getAuth(), 'Content-Type': 'text/calendar; charset=utf-8' };
  if (etag) headers['If-Match'] = `"${etag}"`;
  else headers['If-None-Match'] = '*';

  const res = await fetch(url, { method: 'PUT', headers, body: icsData });
  if (!res.ok) throw new Error(`PUT event failed: ${res.status}`);
  return { href: url, etag: (res.headers.get('etag') || '').replace(/"/g, '') };
}

/**
 * Delete an event from the server.
 */
async function deleteEvent(eventHref, etag = null) {
  const url = fullUrl(eventHref);
  const headers = { 'Authorization': getAuth() };
  if (etag) headers['If-Match'] = `"${etag}"`;
  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE failed: ${res.status}`);
}

module.exports = { listCalendars, listEvents, putEvent, deleteEvent };
