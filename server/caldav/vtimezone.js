// A time written with a TZID needs a VTIMEZONE block in the same resource
// (RFC 5545 §3.2.19). Times another client wrote come with theirs; a time
// Nodecal puts in a zone for the first time needs one built. Clients look the
// zone up by its IANA name, so the block only has to describe the rule the zone
// follows now: each change is written as a yearly "nth weekday of the month",
// which fits every zone that still observes DST.

const DAY_MS = 86400000;
const MINUTE_MS = 60000;

/** @type {Map<string, Intl.DateTimeFormat>} */
const formats = new Map();

/**
 * @param {string} zone
 * @returns {Intl.DateTimeFormat}
 */
function formatFor(zone) {
  let format = formats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formats.set(zone, format);
  }
  return format;
}

/**
 * How far `zone` is ahead of UTC at `ms`, in minutes.
 * @param {string} zone
 * @param {number} ms
 */
function offsetAt(zone, ms) {
  /** @type {Object<string, number>} */
  const parts = {};
  for (const part of formatFor(zone).formatToParts(new Date(ms))) {
    parts[part.type] = Number(part.value);
  }
  const shown = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((shown - Math.floor(ms / 1000) * 1000) / MINUTE_MS);
}

/**
 * The instants in `year` at which `zone` changes its offset, to the minute.
 * @param {string} zone
 * @param {number} year
 * @returns {Array<{ at: number, from: number, to: number }>}
 */
function transitionsIn(zone, year) {
  const transitions = [];
  const end = Date.UTC(year + 1, 0, 1);
  let day = Date.UTC(year, 0, 1);
  let offset = offsetAt(zone, day);
  for (; day < end; day += DAY_MS) {
    const next = offsetAt(zone, day + DAY_MS);
    if (next !== offset) transitions.push(firstChange(zone, day, offset, next));
    offset = next;
  }
  return transitions;
}

/**
 * The first minute after `low` at which `zone` shows offset `to`.
 * @param {string} zone
 * @param {number} low - an instant still at offset `from`
 * @param {number} from
 * @param {number} to
 */
function firstChange(zone, low, from, to) {
  let before = low;
  let after = low + DAY_MS;
  while (after - before > MINUTE_MS) {
    const middle = before + Math.floor((after - before) / 2 / MINUTE_MS) * MINUTE_MS;
    if (offsetAt(zone, middle) === from) before = middle;
    else after = middle;
  }
  return { at: after, from, to };
}

/**
 * @param {number} minutes
 * @returns {string} e.g. +0200
 */
function offsetText(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  return `${sign}${hours}${String(abs % 60).padStart(2, '0')}`;
}

/** @param {number} n */
function pad(n) {
  return String(n).padStart(2, '0');
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * One STANDARD or DAYLIGHT observance for a change, as the yearly rule it
 * follows. Its DTSTART is the wall time the change happens at, read on the
 * clock before it, in 1970 like most clients write it.
 * @param {{ at: number, from: number, to: number }} change
 * @param {string} kind - STANDARD or DAYLIGHT
 * @returns {string[]}
 */
function observance(change, kind) {
  const wall = new Date(change.at + change.from * MINUTE_MS);
  const month = wall.getUTCMonth();
  const date = wall.getUTCDate();
  const weekday = wall.getUTCDay();
  const daysInMonth = new Date(Date.UTC(wall.getUTCFullYear(), month + 1, 0)).getUTCDate();
  let week = Math.ceil(date / 7);
  if (date + 7 > daysInMonth) week = -1;

  const time = `T${pad(wall.getUTCHours())}${pad(wall.getUTCMinutes())}00`;
  const start = `1970${pad(month + 1)}${pad(dayIn1970(month, weekday, week))}${time}`;
  return [
    `BEGIN:${kind}`,
    `DTSTART:${start}`,
    `RRULE:FREQ=YEARLY;BYMONTH=${month + 1};BYDAY=${week}${WEEKDAYS[weekday]}`,
    `TZOFFSETFROM:${offsetText(change.from)}`,
    `TZOFFSETTO:${offsetText(change.to)}`,
    `END:${kind}`,
  ];
}

/**
 * The day of the month the `week`th `weekday` fell on in 1970 (-1 for the last).
 * @param {number} month - 0-based
 * @param {number} weekday - 0 is Sunday
 * @param {number} week
 */
function dayIn1970(month, weekday, week) {
  if (week === -1) {
    const last = new Date(Date.UTC(1970, month + 1, 0));
    return last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
  }
  const first = new Date(Date.UTC(1970, month, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (week - 1) * 7;
}

/**
 * A VTIMEZONE block for an IANA zone, following the rules it had in `year`.
 * @param {string} zone - a valid IANA name
 * @param {number} year
 * @returns {string[]}
 */
function vtimezoneLines(zone, year) {
  const changes = transitionsIn(zone, year);
  const lines = ['BEGIN:VTIMEZONE', `TZID:${zone}`];
  // Without a change each way there is no yearly rule: a zone that moved its
  // offset for good that year is written at the offset it ended on.
  if (changes.length !== 2) {
    const offset = offsetText(offsetAt(zone, Date.UTC(year + 1, 0, 1) - 1));
    lines.push(
      'BEGIN:STANDARD',
      'DTSTART:19700101T000000',
      `TZOFFSETFROM:${offset}`,
      `TZOFFSETTO:${offset}`,
      'END:STANDARD',
    );
    lines.push('END:VTIMEZONE');
    return lines;
  }
  for (const change of changes) {
    let kind = 'STANDARD';
    if (change.to > change.from) kind = 'DAYLIGHT';
    lines.push(...observance(change, kind));
  }
  lines.push('END:VTIMEZONE');
  return lines;
}

module.exports = { vtimezoneLines };
