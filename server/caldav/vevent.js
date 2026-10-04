const {
  foldLine,
  parseIcsDate,
  parseCategories,
  unescapeIcsText,
  escapeIcsText,
  resolveTimezone,
  parseProperty,
} = require('./parser');
const { readCalendar, splitComponent, sameValue, lastProperty } = require('./icsComponents');
const {
  TIME_PROPERTIES,
  eventTimes,
  startZone,
  timeLines,
  recurrenceIdLines,
} = require('./veventTimes');
const { alarmMinutes, alarmLines } = require('./veventAlarm');
const { vtimezoneLines } = require('./vtimezone');

// Events as VEVENTs. As with tasks (vtodo.js), the resource is shared with
// every other client on the calendar: attendees, extra alarms, X- properties
// and zoned times Nodecal never shows. An event keeps the lines it was read
// from (`rawVevent`), and writing it back replaces only what changed.

const CRLF = '\r\n';

/**
 * The properties each plain event field is read from. Times, RECURRENCE-ID,
 * EXDATE and alarms have rules of their own below.
 * @type {Object<string, string[]>}
 */
const FIELD_PROPERTIES = {
  title: ['SUMMARY'],
  description: ['DESCRIPTION'],
  location: ['LOCATION'],
  url: ['URL'],
  categories: ['CATEGORIES'],
  rrule: ['RRULE'],
};

// Rewritten on every save: they describe the write, not the event.
const STAMP_PROPERTIES = ['UID', 'DTSTAMP', 'LAST-MODIFIED'];
// EXRULE is not read (RFC 5545 deprecated it), so it is only kept while the
// series it belongs to keeps its start and rule. RDATE is read into `rdates`
// and written from there, like EXDATE, so a shift or a split can move it.
const RECURRENCE_SET_PROPERTIES = ['EXRULE'];

/**
 * A VEVENT as this parser hands it on. A document can hold several with the
 * same `uid`: the master of a recurring series, plus one per occurrence that
 * was edited individually, each carrying the `recurrenceId` it replaces.
 * @typedef {object} ParsedEvent
 * @property {string} uid
 * @property {string} title
 * @property {string} start - ISO UTC
 * @property {string} end - ISO UTC
 * @property {boolean} allDay
 * @property {string|null} zone - IANA zone DTSTART's wall time is in; null for
 *   a UTC time or a whole day
 * @property {string} description
 * @property {string} location
 * @property {string} url
 * @property {string[]} categories
 * @property {string|null} rrule
 * @property {string[]|null} exdates
 * @property {string[]|null} rdates - extra occurrences; Nodecal does not draw
 *   them, but keeps them on the series for the clients that do
 * @property {string|null} recurrenceId - ISO UTC instant this VEVENT replaces
 * @property {number|null} alarmMinutes
 * @property {string[]} rawVevent - unfolded lines, without BEGIN/END
 * @property {string[]} rawTimezones - the document's VTIMEZONE blocks
 */

/**
 * Parse a VCALENDAR ICS string into an array of event objects.
 * @param {string} icsText
 * @param {{ timezone?: string }} [opts] - zone a floating time is read in
 * @returns {ParsedEvent[]}
 */
function parseIcs(icsText, { timezone = 'UTC' } = {}) {
  const { components, timezones } = readCalendar(icsText, 'VEVENT');
  const events = [];
  for (const body of components) {
    const fields = eventFields(body, timezone);
    if (fields) events.push({ ...fields, rawVevent: body, rawTimezones: timezones });
  }
  return events;
}

/**
 * Serialize one event into a full VCALENDAR ICS string.
 * @param {object} event
 * @param {{ timezone?: string }} [opts] - must match the zone the event was
 *   read in, or an unchanged floating time looks moved
 * @returns {string}
 */
function serializeEvent(event, opts) {
  return serializeEvents([event], opts);
}

/**
 * Serialize a whole CalDAV resource — several VEVENTs in one VCALENDAR.
 *
 * A recurring series and the occurrences edited out of it are *one* resource:
 * the master VEVENT plus one override VEVENT per edited occurrence, sharing the
 * UID and told apart by RECURRENCE-ID. PUTting a single VEVENT there would drop
 * every other one, so any change to an exception rewrites the whole set.
 * @param {Array<object>} events - the master first, then its overrides
 * @param {{ timezone?: string }} [opts]
 * @returns {string}
 */
function serializeEvents(events, { timezone = 'UTC' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nodecal//EN'];
  // A time kept with a TZID still needs its VTIMEZONE. A series' VEVENTs were
  // read from one document, so they carry the same blocks.
  const seen = new Set();
  for (const event of events) {
    if (!Array.isArray(event.rawTimezones)) continue;
    const key = event.rawTimezones.join('\n');
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(...event.rawTimezones);
  }
  const vevents = [];
  for (const event of events) {
    vevents.push('BEGIN:VEVENT', ...veventLines(event, timezone), 'END:VEVENT');
  }
  lines.push(...missingTimezones(lines, vevents, events), ...vevents, 'END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/**
 * VTIMEZONE blocks for the zones `vevents` name that `head` has none for: a
 * time Nodecal wrote in a zone the document did not hold yet. Built on the
 * rules of the year the earliest event starts in.
 * @param {string[]} head - the document so far, VTIMEZONE blocks included
 * @param {string[]} vevents
 * @param {Array<{ start: string }>} events
 * @returns {string[]}
 */
function missingTimezones(head, vevents, events) {
  const defined = new Set();
  for (const line of head) {
    if (/^TZID:/i.test(line)) defined.add(line.slice(5));
  }
  const missing = new Set();
  for (const line of vevents) {
    const prop = parseProperty(line);
    const tzid = prop?.params.TZID;
    if (tzid && !defined.has(tzid) && resolveTimezone(tzid, '') === tzid) missing.add(tzid);
  }
  if (missing.size === 0) return [];

  let year = Infinity;
  for (const event of events) year = Math.min(year, new Date(event.start).getUTCFullYear());
  const blocks = [];
  for (const zone of missing) blocks.push(...vtimezoneLines(zone, year));
  return blocks;
}

/**
 * The lines each VEVENT of a document was written as, in order, for the cache
 * record of what was just PUT: the next edit then compares against this write.
 * The zone comes along because it follows the DTSTART line, which a new event
 * or a whole day made timed only gets on writing (see dateLine).
 * @param {string} icsText
 * @param {{ timezone?: string }} [opts] - zone a floating time is read in
 * @returns {Array<{ rawVevent: string[], rawTimezones: string[], zone: string|null }>}
 */
function writtenLines(icsText, { timezone = 'UTC' } = {}) {
  const { components, timezones } = readCalendar(icsText, 'VEVENT');
  const written = [];
  for (const body of components) {
    const dtstart = lastProperty(splitComponent(body).props, 'DTSTART');
    const zone = dtstart ? startZone(dtstart, timezone) : null;
    written.push({ rawVevent: body, rawTimezones: timezones, zone });
  }
  return written;
}

/**
 * The content lines of one VEVENT, without its BEGIN/END. An event read from
 * CalDAV keeps every line it arrived with except the fields that changed; a
 * new one (no `rawVevent`) is written from its fields alone.
 * @param {object} event
 * @param {string} timezone
 * @returns {string[]}
 */
function veventLines(event, timezone) {
  const raw = Array.isArray(event.rawVevent) ? event.rawVevent : [];
  const { props, nested } = splitComponent(raw);
  const original = raw.length ? eventFields(raw, timezone) : null;
  const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  /** @type {Set<string>} */
  const changed = new Set();
  for (const field of Object.keys(FIELD_PROPERTIES)) {
    if (!original || !sameValue(original[field], event[field])) changed.add(field);
  }
  const recurrenceKept =
    original && !changed.has('rrule') && Date.parse(original.start) === Date.parse(event.start);

  const lines = [`UID:${event.uid}`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${stamp}`];
  for (const prop of props) {
    if (STAMP_PROPERTIES.includes(prop.name) || TIME_PROPERTIES.includes(prop.name)) continue;
    if (prop.name === 'EXDATE' || prop.name === 'RDATE' || prop.name === 'RECURRENCE-ID') continue;
    if (RECURRENCE_SET_PROPERTIES.includes(prop.name) && !recurrenceKept) continue;
    const field = fieldOf(prop.name);
    if (field && changed.has(field)) continue;
    lines.push(prop.line);
  }
  for (const field of changed) lines.push(...fieldLines(field, event));
  lines.push(...timeLines(props, original, event, timezone));
  lines.push(...recurrenceIdLines(props, original?.recurrenceId ?? null, event, timezone));
  lines.push(...dateListLines(props, 'EXDATE', event.exdates));
  // A record cached before `rdates` was read has none: it keeps what it had.
  const rdates = event.rdates === undefined ? original?.rdates : event.rdates;
  lines.push(...dateListLines(props, 'RDATE', rdates));
  // Components (VALARM) come after every property of the VEVENT.
  lines.push(...alarmLines(nested, original?.alarmMinutes ?? null, event.alarmMinutes));
  return lines;
}

/**
 * The event fields a VEVENT's lines describe, or null when it lacks the UID
 * or DTSTART an event needs.
 * @param {string[]} body - unfolded lines, without BEGIN/END
 * @param {string} timezone
 */
function eventFields(body, timezone) {
  const { props, nested } = splitComponent(body);
  /** @type {Object<string, import('./icsComponents').IcsProperty>} */
  const byName = {};
  const categoryValues = [];
  /** @type {string[]} */
  const exdates = [];
  /** @type {string[]} */
  const rdates = [];
  for (const prop of props) {
    byName[prop.name] = prop;
    // Clients may split categories and date lists over several lines; all count.
    if (prop.name === 'CATEGORIES') categoryValues.push(prop.value);
    if (prop.name === 'EXDATE') {
      for (const value of prop.value.split(',')) exdates.push(value.trim());
    }
    if (prop.name === 'RDATE') {
      for (const value of prop.value.split(',')) rdates.push(value.trim());
    }
  }
  const uid = byName.UID?.value;
  if (!uid) return null;
  const times = eventTimes(byName, timezone);
  if (!times) return null;

  return {
    uid,
    title: unescapeIcsText(byName.SUMMARY?.value || '(No title)'),
    start: times.start,
    end: times.end,
    allDay: times.allDay,
    zone: times.zone,
    description: unescapeIcsText(byName.DESCRIPTION?.value || ''),
    location: unescapeIcsText(byName.LOCATION?.value || ''),
    url: unescapeIcsText(byName.URL?.value || ''),
    categories: parseCategories(categoryValues.join(',')),
    rrule: byName.RRULE?.value || null,
    exdates: exdates.length > 0 ? exdates : null,
    rdates: rdates.length > 0 ? rdates : null,
    recurrenceId: parseRecurrenceId(byName['RECURRENCE-ID'], timezone),
    alarmMinutes: alarmMinutes(nested),
  };
}

/**
 * RECURRENCE-ID identifies which occurrence of a series a VEVENT replaces.
 * Stored as an ISO UTC string like every other datetime here, rather than the
 * raw `20260819T100000Z` form, because matching an occurrence means comparing
 * instants.
 * @param {{value: string, params: Object<string,string>}|undefined} prop
 * @param {string} timezone - fallback zone for a floating value
 * @returns {string|null}
 */
function parseRecurrenceId(prop, timezone) {
  if (!prop) return null;
  const parsed = parseIcsDate(prop.value, prop.params, timezone);
  if (!parsed) return null;
  return parsed.date.toISOString();
}

/**
 * The EXDATE or RDATE lines for an event being written back. A line whose
 * dates are all still wanted is kept as it was, zone and all; one that lost a
 * date keeps its parameters and the dates left. Dates that are new get a line
 * of their own.
 * @param {import('./icsComponents').IcsProperty[]} props
 * @param {'EXDATE'|'RDATE'} name
 * @param {string[]|null|undefined} wanted
 * @returns {string[]}
 */
function dateListLines(props, name, wanted) {
  const values = wanted || [];
  const lines = [];
  const covered = new Set();
  for (const prop of props) {
    if (prop.name !== name) continue;
    const kept = [];
    for (const value of prop.value.split(',')) {
      if (values.includes(value.trim())) kept.push(value.trim());
    }
    if (kept.length === 0) continue;
    for (const value of kept) covered.add(value);
    lines.push(prop.line.slice(0, prop.line.indexOf(':') + 1) + kept.join(','));
  }
  for (const value of values) {
    if (covered.has(value)) continue;
    covered.add(value);
    lines.push(`${name}${valueType(value)}:${value}`);
  }
  return lines;
}

/**
 * The VALUE parameter a date-list value needs: none for a date-time.
 * @param {string} value
 * @returns {string}
 */
function valueType(value) {
  if (value.includes('/')) return ';VALUE=PERIOD';
  if (/^\d{8}$/.test(value)) return ';VALUE=DATE';
  return '';
}

/**
 * The lines a changed field is written as.
 * @param {string} field - a key of FIELD_PROPERTIES
 * @param {object} event
 * @returns {string[]}
 */
function fieldLines(field, event) {
  if (field === 'title') return [`SUMMARY:${escapeIcsText(event.title || '')}`];
  if (field === 'description' && event.description) {
    return [`DESCRIPTION:${escapeIcsText(event.description)}`];
  }
  if (field === 'location' && event.location) {
    return [`LOCATION:${escapeIcsText(event.location)}`];
  }
  // A URI is not escaped like TEXT, so a line break would start a new property.
  if (field === 'url' && event.url) return [`URL:${String(event.url).replace(/[\r\n]+/g, '')}`];
  if (field === 'categories' && event.categories?.length) {
    return [`CATEGORIES:${event.categories.join(',')}`];
  }
  if (field === 'rrule' && event.rrule) return [`RRULE:${event.rrule}`];
  return [];
}

/**
 * @param {string} name
 * @returns {string|null} the event field the property feeds
 */
function fieldOf(name) {
  for (const [field, names] of Object.entries(FIELD_PROPERTIES)) {
    if (names.includes(name)) return field;
  }
  return null;
}

module.exports = { parseIcs, serializeEvent, serializeEvents, writtenLines };
