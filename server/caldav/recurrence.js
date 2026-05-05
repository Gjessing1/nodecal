const { RRule, RRuleSet, rrulestr } = require('rrule');
const { formatIcsDate } = require('./parser');

/**
 * Expand a recurring event into individual occurrence objects within [from, to].
 * Each occurrence gets an id of `uid_YYYYMMDDTHHMMSSZ` and carries recurring metadata.
 *
 * @param {object} event - cached event with .rrule, .exdates, .start, .end
 * @param {Date} from
 * @param {Date} to
 * @returns {Array<object>}
 */
function expandRecurring(event, from, to) {
  const baseStart = new Date(event.start);
  const duration = new Date(event.end) - baseStart;
  const dtstart = formatIcsDate(baseStart, false); // YYYYMMDDTHHMMSSZ

  let source;
  try {
    const rule = rrulestr(`DTSTART:${dtstart}\nRRULE:${event.rrule}`);
    if (event.exdates?.length) {
      source = new RRuleSet();
      source.rrule(rule);
      for (const ex of event.exdates) source.exdate(parseExdate(ex));
    } else {
      source = rule;
    }
  } catch (err) {
    console.error(`Failed to parse RRULE for ${event.uid}:`, err.message);
    return [];
  }

  return source.between(from, to, true).map(occStart => {
    const occEnd = new Date(occStart.getTime() + duration);
    const occDateIso = formatIcsDate(occStart, false);
    return {
      ...event,
      id: `${event.uid}_${occDateIso}`,
      start: occStart.toISOString(),
      end: occEnd.toISOString(),
      recurring: true,
      occurrenceDate: occStart.toISOString(),
    };
  });
}

/**
 * Return a new RRULE string with UNTIL set to the given date (and COUNT removed).
 * @param {string} rruleStr - e.g. "FREQ=WEEKLY;BYDAY=MO"
 * @param {Date} untilDate
 * @returns {string}
 */
function setRruleUntil(rruleStr, untilDate) {
  let result = rruleStr.replace(/;?(UNTIL|COUNT)=[^;]*/gi, '').replace(/;$/, '');
  return result + ';UNTIL=' + formatIcsDate(untilDate, false);
}

/**
 * Parse an EXDATE string (YYYYMMDDTHHMMSSZ or YYYYMMDD) to a Date.
 * @param {string} str
 * @returns {Date}
 */
function parseExdate(str) {
  const s = str.trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? 'Z' : ''}`);
  const d = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (d) return new Date(`${d[1]}-${d[2]}-${d[3]}T00:00:00Z`);
  return new Date(s);
}

module.exports = { expandRecurring, setRruleUntil, parseExdate };
