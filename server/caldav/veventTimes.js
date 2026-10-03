const { parseIcsDate, formatIcsDate, resolveTimezone } = require('./parser');
const { lastProperty } = require('./icsComponents');

// When an event happens, read from and written back to DTSTART, DTEND and
// DURATION as one group. Nodecal holds start and end as UTC instants, but
// another client may have written them in a zone (`DTSTART;TZID=Europe/Oslo`)
// and that zone is what keeps a weekly 10:00 at 10:00 across a DST change. So
// unchanged times keep their lines, and changed ones keep their zone.

/** @typedef {import('./icsComponents').IcsProperty} IcsProperty */

/** Property names this module owns when an event is written back. */
const TIME_PROPERTIES = ['DTSTART', 'DTEND', 'DURATION'];

/**
 * @param {Object<string, IcsProperty>} byName - the VEVENT's own properties
 * @param {string} timezone - zone a floating time is read in
 * @returns {{ start: string, end: string, allDay: boolean, zone: string|null }|null} ISO UTC
 */
function eventTimes(byName, timezone) {
  const startInfo = byName.DTSTART
    ? parseIcsDate(byName.DTSTART.value, byName.DTSTART.params, timezone)
    : null;
  if (!startInfo) return null;

  let endDate;
  if (byName.DTEND) {
    endDate = parseIcsDate(byName.DTEND.value, byName.DTEND.params, timezone)?.date;
  } else if (byName.DURATION) {
    endDate = new Date(startInfo.date.getTime() + parseDuration(byName.DURATION.value));
  } else {
    endDate = new Date(startInfo.date.getTime() + (startInfo.allDay ? 86400000 : 3600000));
  }
  return {
    start: startInfo.date.toISOString(),
    end: (endDate || startInfo.date).toISOString(),
    allDay: startInfo.allDay,
    zone: startZone(byName.DTSTART, timezone),
  };
}

/**
 * The zone a DTSTART's wall time is in: its TZID, or `timezone` for a floating
 * time. A series repeats at that wall time, so it is what recurrence expands
 * in. Null for a UTC time or a whole day, which no DST change can move.
 * @param {IcsProperty} prop
 * @param {string} timezone - zone a floating time is read in
 * @returns {string|null} a valid IANA name
 */
function startZone(prop, timezone) {
  if (isDate(prop.value) || /Z$/i.test(prop.value)) return null;
  return resolveTimezone(prop.params.TZID, timezone);
}

/**
 * The DTSTART and DTEND lines for an event being written back. Unchanged times
 * keep their original lines, DURATION included; changed ones are written as
 * DTSTART + DTEND, since DURATION and DTEND cannot stand together.
 * @param {IcsProperty[]} props - the event's original top-level properties
 * @param {{ start: string, end: string, allDay: boolean }|null} original
 * @param {{ start: string, end: string, allDay?: boolean }} event
 * @param {string} timezone
 * @returns {string[]}
 */
function timeLines(props, original, event, timezone) {
  const allDay = !!event.allDay;
  if (
    original &&
    original.allDay === allDay &&
    sameInstant(original.start, event.start) &&
    sameInstant(original.end, event.end)
  ) {
    const kept = [];
    for (const prop of props) {
      if (TIME_PROPERTIES.includes(prop.name)) kept.push(prop.line);
    }
    return kept;
  }
  const start = lastProperty(props, 'DTSTART');
  const end = lastProperty(props, 'DTEND') || start;
  return [
    dateLine('DTSTART', event.start, allDay, start, timezone),
    dateLine('DTEND', event.end, allDay, end, timezone),
  ];
}

/**
 * The RECURRENCE-ID line of an override. Its value type follows the master's
 * DTSTART, not the override's own: an occurrence of a timed series moved to a
 * whole day still names the timed instant it replaces.
 * @param {IcsProperty[]} props
 * @param {string|null} originalId - ISO UTC the original line parsed to
 * @param {{ recurrenceId?: string|null, allDay?: boolean }} event
 * @param {string} timezone
 * @returns {string[]}
 */
function recurrenceIdLines(props, originalId, event, timezone) {
  if (!event.recurrenceId) return [];
  const prop = lastProperty(props, 'RECURRENCE-ID');
  if (prop && sameInstant(originalId, event.recurrenceId)) return [prop.line];
  // An override built from its master carries the master's lines.
  const template = prop || lastProperty(props, 'DTSTART');
  const allDay = template ? isDate(template.value) : !!event.allDay;
  return [dateLine('RECURRENCE-ID', event.recurrenceId, allDay, template, timezone)];
}

/**
 * A date property for `iso`, in the zone `template` was written in when it had
 * one, else in UTC.
 * @param {string} name
 * @param {string} iso
 * @param {boolean} allDay
 * @param {IcsProperty|null} template - the line this one replaces
 * @param {string} timezone
 */
function dateLine(name, iso, allDay, template, timezone) {
  const date = new Date(iso);
  if (allDay) return `${name};VALUE=DATE:${formatIcsDate(date, true)}`;
  const tzid = template && !isDate(template.value) ? template.params.TZID : undefined;
  if (!tzid) return `${name}:${formatIcsDate(date, false)}`;
  return `${name};TZID=${tzid}:${wallTime(date, resolveTimezone(tzid, timezone))}`;
}

/**
 * The local time `date` shows in `zone`, as an ICS DATE-TIME without a Z.
 * @param {Date} date
 * @param {string} zone - a valid IANA name
 * @returns {string} e.g. 20261005T100000
 */
function wallTime(date, zone) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  /** @type {Object<string, string>} */
  const parts = {};
  for (const part of format.formatToParts(date)) parts[part.type] = part.value;
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}${parts.second}`;
}

/** @param {string} value */
function isDate(value) {
  return /^\d{8}$/.test(value);
}

/**
 * Compared as instants, so `…T08:00:00Z` and `…T08:00:00.000Z` agree.
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 */
function sameInstant(a, b) {
  if (!a || !b) return !a && !b;
  return Date.parse(a) === Date.parse(b);
}

function parseDuration(dur) {
  const m = dur.match(/^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const w = parseInt(m[1] || 0),
    d = parseInt(m[2] || 0);
  const h = parseInt(m[3] || 0),
    min = parseInt(m[4] || 0),
    s = parseInt(m[5] || 0);
  return ((w * 7 + d) * 86400 + h * 3600 + min * 60 + s) * 1000;
}

module.exports = {
  TIME_PROPERTIES,
  eventTimes,
  startZone,
  wallTime,
  timeLines,
  recurrenceIdLines,
  sameInstant,
};
