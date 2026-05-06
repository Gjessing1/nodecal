const fs = require('fs');
const config = require('../config');
const { parseIcs, parseVtodo } = require('./parser');

function syncLog(msg) {
  if (config.app.debugSync) console.log(`[sync] ${msg}`);
}

/**
 * Return the tasks CalDAV URL, preferring a runtime override from settings.json.
 */
function getEffectiveTasksUrl() {
  try {
    const s = JSON.parse(fs.readFileSync('/config/settings.json', 'utf8'));
    if (s.tasksCalDAVUrl) return s.tasksCalDAVUrl;
  } catch { /* no override file */ }
  return config.caldav.tasksUrl || null;
}

function fullUrlFromBase(href, base) {
  if (href.startsWith('http')) return href;
  const u = new URL(base);
  return u.origin + href;
}

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
 * Fetch all calendars, including each calendar's ctag for incremental sync.
 * @returns {Promise<Array<{id, href, name, color, ctag}>>}
 */
async function listCalendars() {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav" xmlns:ical="http://apple.com/ns/ical/" xmlns:cs="http://calendarserver.org/ns/">
  <d:prop><d:resourcetype /><d:displayname /><ical:calendar-color /><cs:getctag /></d:prop>
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
    const ctag = extractTag(block, 'getctag') || '';
    const url = fullUrl(href);
    calendars.push({ id: url, href: url, name, color, ctag });
  }
  return calendars;
}

/**
 * Fetch only href+etag pairs for events in a time range — no ICS bodies.
 * Used by incremental sync to detect which events changed.
 * @returns {Promise<Array<{href, etag}>>}
 */
async function listEventEtags(calendarHref, from, to) {
  const url = fullUrl(calendarHref);
  const fmt = d => d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<cal:calendar-query xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag /></d:prop>
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
  if (!res.ok && res.status !== 207) throw new Error(`etag REPORT failed: ${res.status}`);
  const xml = await res.text();

  const results = [];
  for (const block of extractAllTags(xml, 'response')) {
    const href = extractTag(block, 'href');
    const etag = (extractTag(block, 'getetag') || '').replace(/"/g, '');
    if (href && etag) results.push({ href: fullUrl(href), etag });
  }
  return results;
}

/**
 * Fetch full ICS data for specific event hrefs via calendar-multiget.
 * @returns {Promise<Array>}
 */
async function fetchEventsByHref(calendarHref, hrefs) {
  if (!hrefs.length) return [];
  const url = fullUrl(calendarHref);
  const hrefLines = hrefs.map(h => `  <d:href>${h}</d:href>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<cal:calendar-multiget xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag /><cal:calendar-data /></d:prop>
${hrefLines}
</cal:calendar-multiget>`;

  const res = await davRequest('REPORT', url, { 'Depth': '1' }, body);
  if (!res.ok && res.status !== 207) throw new Error(`multiget REPORT failed: ${res.status}`);
  const xml = await res.text();

  const events = [];
  for (const block of extractAllTags(xml, 'response')) {
    const href = extractTag(block, 'href');
    const etag = (extractTag(block, 'getetag') || '').replace(/"/g, '');
    const icsData = unescapeXml(extractTag(block, 'calendar-data') || '');
    if (!icsData) continue;
    for (const ev of parseIcs(icsData, { timezone: config.app.timezone })) {
      events.push({ ...ev, href: fullUrl(href), etag });
    }
  }
  return events;
}

/**
 * Create or update an event. On 412 (stale etag) retries without the guard
 * to implement last-write-wins conflict resolution.
 */
async function putEvent(calendarHref, uid, icsData, etag = null) {
  const base = fullUrl(calendarHref).replace(/\/?$/, '/');
  const url = base + uid + '.ics';
  const headers = { 'Authorization': getAuth(), 'Content-Type': 'text/calendar; charset=utf-8' };
  if (etag) headers['If-Match'] = `"${etag}"`;
  else headers['If-None-Match'] = '*';

  let res = await fetch(url, { method: 'PUT', headers, body: icsData });

  if (res.status === 412 && etag) {
    // Concurrent edit — last-write-wins: force-overwrite without etag guard
    console.log(`Conflict on PUT ${uid}: local etag ${etag} rejected by server (412) — overwriting with last-write-wins`);
    syncLog(`etag mismatch detected on PUT: uid=${uid} local-etag=${etag}`);
    delete headers['If-Match'];
    res = await fetch(url, { method: 'PUT', headers, body: icsData });
    syncLog(`local overwrite applied: uid=${uid}`);
  }

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

/**
 * Fetch href+etag pairs for all VTODOs in the tasks collection.
 * @param {string} tasksUrl
 * @returns {Promise<Array<{href, etag}>>}
 */
async function listTaskEtags(tasksUrl) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<cal:calendar-query xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag /></d:prop>
  <cal:filter>
    <cal:comp-filter name="VCALENDAR">
      <cal:comp-filter name="VTODO"/>
    </cal:comp-filter>
  </cal:filter>
</cal:calendar-query>`;

  const res = await davRequest('REPORT', tasksUrl, { 'Depth': '1' }, body);
  if (res.status === 404) return [];
  if (!res.ok && res.status !== 207) throw new Error(`task etag REPORT failed: ${res.status}`);
  const xml = await res.text();

  const results = [];
  for (const block of extractAllTags(xml, 'response')) {
    const href = extractTag(block, 'href');
    const etag = (extractTag(block, 'getetag') || '').replace(/"/g, '');
    if (href && etag) results.push({ href: fullUrlFromBase(href, tasksUrl), etag });
  }
  return results;
}

/**
 * Fetch full ICS data for specific task hrefs via calendar-multiget.
 * @param {string} tasksUrl
 * @param {string[]} hrefs
 * @returns {Promise<Array>}
 */
async function fetchTasksByHref(tasksUrl, hrefs) {
  if (!hrefs.length) return [];
  const hrefLines = hrefs.map(h => `  <d:href>${h}</d:href>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<cal:calendar-multiget xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag /><cal:calendar-data /></d:prop>
${hrefLines}
</cal:calendar-multiget>`;

  const res = await davRequest('REPORT', tasksUrl, { 'Depth': '1' }, body);
  if (!res.ok && res.status !== 207) throw new Error(`task multiget REPORT failed: ${res.status}`);
  const xml = await res.text();

  const result = [];
  for (const block of extractAllTags(xml, 'response')) {
    const href = extractTag(block, 'href');
    const etag = (extractTag(block, 'getetag') || '').replace(/"/g, '');
    const icsData = unescapeXml(extractTag(block, 'calendar-data') || '');
    if (!icsData) continue;
    for (const task of parseVtodo(icsData)) {
      result.push({ ...task, href: fullUrlFromBase(href, tasksUrl), etag });
    }
  }
  return result;
}

/**
 * Create or update a task. Last-write-wins on 412.
 * @param {string} tasksUrl
 * @param {string} uid
 * @param {string} icsData
 * @param {string|null} etag
 */
async function putTask(tasksUrl, uid, icsData, etag = null) {
  const base = tasksUrl.replace(/\/?$/, '/');
  const url = base + uid + '.ics';
  const headers = { 'Authorization': getAuth(), 'Content-Type': 'text/calendar; charset=utf-8' };
  if (etag) headers['If-Match'] = `"${etag}"`;
  else headers['If-None-Match'] = '*';

  let res = await fetch(url, { method: 'PUT', headers, body: icsData });

  if (res.status === 412 && etag) {
    console.log(`Conflict on PUT task ${uid}: local etag ${etag} rejected (412) — overwriting with last-write-wins`);
    syncLog(`etag mismatch detected on PUT task: uid=${uid} local-etag=${etag}`);
    delete headers['If-Match'];
    res = await fetch(url, { method: 'PUT', headers, body: icsData });
    syncLog(`local overwrite applied (task): uid=${uid}`);
  }

  if (!res.ok) throw new Error(`PUT task failed: ${res.status}`);
  return { href: url, etag: (res.headers.get('etag') || '').replace(/"/g, '') };
}

/**
 * Delete a task from the server.
 * @param {string} href  full URL of the .ics file
 * @param {string|null} etag
 */
async function deleteTask(href, etag = null) {
  const headers = { 'Authorization': getAuth() };
  if (etag) headers['If-Match'] = `"${etag}"`;
  const res = await fetch(href, { method: 'DELETE', headers });
  if (!res.ok && res.status !== 404) throw new Error(`DELETE task failed: ${res.status}`);
}

module.exports = {
  listCalendars, listEventEtags, fetchEventsByHref, putEvent, deleteEvent,
  getEffectiveTasksUrl,
  listTaskEtags, fetchTasksByHref, putTask, deleteTask,
};
