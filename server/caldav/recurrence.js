const { rrulestr } = require('rrule');
const { formatIcsDate, floatingToUtc } = require('./parser');
const { wallTime } = require('./veventTimes');

// A series written in a zone (`DTSTART;TZID=Europe/Oslo:…T100000`) repeats at
// 10:00 on the wall, so its UTC instant moves an hour at each DST change.
// rrule counts in UTC only (its own `tzid` option leans on the server's zone),
// so the rule is run over the wall times, written as if they were UTC, and
// each occurrence is converted back to an instant afterwards.

// Wider than any UTC offset, so the wall-time window never cuts off an
// occurrence whose instant is inside [from, to].
const WALL_MARGIN_MS = 86400000;

/**
 * Expand a recurring event into individual occurrence objects within [from, to].
 * Each occurrence gets an id of `uid_YYYYMMDDTHHMMSSZ` and carries recurring metadata.
 *
 * @param {object} event - cached event with .rrule, .exdates, .start, .end, .zone
 * @param {Date} from
 * @param {Date} to
 * @returns {Array<object>}
 */
function expandRecurring(event, from, to) {
  const baseStart = new Date(event.start);
  const duration = new Date(event.end).getTime() - baseStart.getTime();
  const zone = event.allDay ? null : event.zone || null;

  let rule;
  try {
    rule = rrulestr(`DTSTART:${wallStamp(baseStart, zone)}\nRRULE:${wallUntil(event.rrule, zone)}`);
  } catch (err) {
    console.error(`Failed to parse RRULE for ${event.uid}:`, err.message);
    return [];
  }

  const skipped = new Set();
  for (const ex of event.exdates || []) skipped.add(parseExdate(ex, zone).getTime());

  const occurrences = [];
  const wallFrom = new Date(from.getTime() - WALL_MARGIN_MS);
  const wallTo = new Date(to.getTime() + WALL_MARGIN_MS);
  for (const wall of rule.between(wallFrom, wallTo, true)) {
    const occStart = zone ? floatingToUtc(wall.toISOString().slice(0, 19), zone) : wall;
    if (occStart < from || occStart > to || skipped.has(occStart.getTime())) continue;
    occurrences.push({
      ...event,
      id: `${event.uid}_${formatIcsDate(occStart, false)}`,
      start: occStart.toISOString(),
      end: new Date(occStart.getTime() + duration).toISOString(),
      recurring: true,
      occurrenceDate: occStart.toISOString(),
    });
  }
  return occurrences;
}

/**
 * Where a series' rule reaches `at`: its first occurrence at or after that
 * instant, and how many come before it. EXDATEs are not applied, because COUNT
 * counts the occurrences they skip. Run on the wall clock like expandRecurring,
 * so a zoned series splits at the occurrence a DST change moved.
 * @param {object} event - cached master with .rrule, .start, .zone
 * @param {Date} at
 * @returns {{ first: Date|null, before: number }}
 */
function splitSeries(event, at) {
  const zone = event.allDay ? null : event.zone || null;
  const rule = rrulestr(
    `DTSTART:${wallStamp(new Date(event.start), zone)}\nRRULE:${wallUntil(event.rrule, zone)}`,
  );
  /** @type {Date|null} */
  let first = null;
  let before = 0;
  rule.all(function visit(wall) {
    const instant = zone ? floatingToUtc(wall.toISOString().slice(0, 19), zone) : wall;
    if (instant < at) {
      before++;
      return true;
    }
    first = instant;
    return false;
  });
  return { first, before };
}

/**
 * DTSTART for the rule: the instant in UTC, or its wall time in `zone` dressed
 * as UTC.
 * @param {Date} date
 * @param {string|null} zone
 */
function wallStamp(date, zone) {
  if (!zone) return formatIcsDate(date, false);
  return `${wallTime(date, zone)}Z`;
}

/**
 * The RRULE with a UTC UNTIL moved onto the wall clock the rule runs on, so the
 * last occurrence is still compared with the instant UNTIL names.
 * @param {string} rrule
 * @param {string|null} zone
 */
function wallUntil(rrule, zone) {
  if (!zone) return rrule;
  return rrule.replace(/UNTIL=(\d{8}T\d{6})Z/i, function toWall(match, stamp) {
    return `UNTIL=${wallStamp(parseExdate(`${stamp}Z`, null), zone)}`;
  });
}

/**
 * Return a new RRULE string with UNTIL set to the given date (and COUNT removed).
 * All-day events require a DATE-only UNTIL value; timed events use DATETIME.
 * @param {string} rruleStr
 * @param {Date} untilDate
 * @param {boolean} [allDay]
 * @returns {string}
 */
function setRruleUntil(rruleStr, untilDate, allDay = false) {
  let result = rruleStr.replace(/;?(UNTIL|COUNT)=[^;]*/gi, '').replace(/;$/, '');
  return result + ';UNTIL=' + formatIcsDate(untilDate, allDay);
}

/**
 * Parse an EXDATE string (YYYYMMDDTHHMMSSZ, YYYYMMDDTHHMMSS or YYYYMMDD) to a Date.
 * A time without Z is a wall time in the series' zone: the TZID it was written
 * with is not kept on the value, and clients write it in DTSTART's zone.
 * @param {string} str
 * @param {string|null} [zone] - the series' zone; UTC when absent
 * @returns {Date}
 */
function parseExdate(str, zone = null) {
  const s = str.trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/i);
  if (m) {
    const wall = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
    if (m[7] || !zone) return new Date(`${wall}Z`);
    return floatingToUtc(wall, zone);
  }
  const d = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (d) return new Date(`${d[1]}-${d[2]}-${d[3]}T00:00:00Z`);
  return new Date(s);
}

/**
 * Parse an X-RECURRING-INTERVAL string to milliseconds.
 * Supports: "daily", "weekly", "Nd", "Nw" (e.g. "3d", "2w").
 * @param {string} interval
 * @returns {number|null} milliseconds or null if unrecognised
 */
function parseXInterval(interval) {
  if (!interval) return null;
  if (interval === 'daily') return 86400000;
  if (interval === 'weekly') return 7 * 86400000;
  const nd = interval.match(/^(\d+)d$/i);
  if (nd) return parseInt(nd[1], 10) * 86400000;
  const nw = interval.match(/^(\d+)w$/i);
  if (nw) return parseInt(nw[1], 10) * 7 * 86400000;
  return null;
}

/**
 * Compute the next DUE date for a recurring task after completion.
 * X-RECURRING wins over RRULE when both are present.
 *
 * @param {object} task  - task with .due (YYYY-MM-DD), .rrule, .xRecurringType, .xRecurringInterval
 * @param {Date}   completionDate
 * @returns {Date|null}
 */
function computeNextDue(task, completionDate) {
  if (task.xRecurringType === 'after-completion' && task.xRecurringInterval) {
    const ms = parseXInterval(task.xRecurringInterval);
    if (ms === null) return null;
    return new Date(completionDate.getTime() + ms);
  }
  if (task.rrule && task.due) {
    const dueDate = new Date(task.due + 'T00:00:00Z');
    const dtstart = task.due.replace(/-/g, '') + 'T000000Z'; // YYYYMMDDTHHMMSSZ (UTC midnight)
    try {
      const rule = rrulestr(`DTSTART:${dtstart}\nRRULE:${task.rrule}`);
      return rule.after(dueDate, false) || null; // strict: after current due
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = {
  expandRecurring,
  splitSeries,
  setRruleUntil,
  parseExdate,
  computeNextDue,
  parseXInterval,
  rrulestr,
};
