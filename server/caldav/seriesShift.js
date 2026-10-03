const { floatingToUtc, formatIcsDate } = require('./parser');
const { wallTime } = require('./veventTimes');
const { parseExdate, setRruleUntil } = require('./recurrence');
const { recurrenceInstant } = require('./overrides');
const { overridesBefore } = require('./exceptions');

// Moving a series by whole days has to move every value that names one of its
// occurrences: DTSTART, the EXDATEs and RDATEs, UNTIL and each override's
// RECURRENCE-ID.
// If one is left behind, the series stops lining up with its own exceptions.
// An EXDATE then skips nothing, and an override replaces an occurrence that no
// longer exists, so the original occurrence shows again. Days are counted on
// the series' wall clock, so a weekly 10:00 Europe/Oslo moved across a DST
// change stays at 10:00.

const DAY_MS = 86400000;

/**
 * `iso` moved by `days` on the wall clock of `zone`, or by whole UTC days.
 * @param {string} iso
 * @param {number} days
 * @param {string|null} zone
 * @returns {string} ISO UTC
 */
function shiftInstant(iso, days, zone) {
  const date = new Date(iso);
  if (!zone) return new Date(date.getTime() + days * DAY_MS).toISOString();
  const wall = parseExdate(`${wallTime(date, zone)}Z`);
  const moved = new Date(wall.getTime() + days * DAY_MS);
  return floatingToUtc(moved.toISOString().slice(0, 19), zone).toISOString();
}

/**
 * The zone a series repeats in: null for whole days and UTC times.
 * @param {object} event
 * @returns {string|null}
 */
function seriesZone(event) {
  if (event.allDay) return null;
  return event.zone || null;
}

/**
 * An event with its start and end moved.
 * @param {object} event
 * @param {number} days
 * @param {string|null} zone
 */
function shiftTimes(event, days, zone) {
  return {
    ...event,
    start: shiftInstant(event.start, days, zone),
    end: shiftInstant(event.end, days, zone),
  };
}

/**
 * An EXDATE or UNTIL value moved. Written in UTC, or as a date when it was one:
 * a TZID'd original line is not kept for a changed value.
 * @param {string} value
 * @param {number} days
 * @param {string|null} zone
 */
function shiftDateValue(value, days, zone) {
  const moved = shiftInstant(parseExdate(value, zone).toISOString(), days, zone);
  return formatIcsDate(new Date(moved), /^\d{8}$/.test(value.trim()));
}

/**
 * An RDATE value moved: a date, a date-time, or a period whose end moves with
 * its start (a duration end stays as it is).
 * @param {string} value
 * @param {number} days
 * @param {string|null} zone
 */
function shiftRdateValue(value, days, zone) {
  const [from, to] = value.split('/');
  const movedFrom = shiftDateValue(from, days, zone);
  if (to === undefined) return movedFrom;
  if (/^[+-]?P/i.test(to)) return `${movedFrom}/${to}`;
  return `${movedFrom}/${shiftDateValue(to, days, zone)}`;
}

/**
 * Every value of a date list passed through `move`, or null for none.
 * @param {string[]|null|undefined} values
 * @param {(value: string) => string} move
 * @returns {string[]|null}
 */
function movedList(values, move) {
  if (!values || values.length === 0) return null;
  const moved = [];
  for (const value of values) moved.push(move(value));
  return moved;
}

/**
 * A whole series moved, the master and every override together.
 * @param {object} base - the master event
 * @param {Array<object>} overrides
 * @param {number} days
 * @returns {{ base: object, overrides: Array<object> }}
 */
function shiftSeries(base, overrides, days) {
  const zone = seriesZone(base);
  const movedBase = {
    ...shiftTimes(base, days, zone),
    rrule: base.rrule.replace(/UNTIL=(\d{8}(?:T\d{6}Z?)?)/i, function movedUntil(match, value) {
      return `UNTIL=${shiftDateValue(value, days, zone)}`;
    }),
    exdates: movedList(base.exdates, function movedExdate(value) {
      return shiftDateValue(value, days, zone);
    }),
    rdates: movedList(base.rdates, function movedRdate(value) {
      return shiftRdateValue(value, days, zone);
    }),
  };

  const movedOverrides = [];
  for (const ov of overrides) {
    // The override's own times may be in a zone of their own; RECURRENCE-ID
    // names an occurrence of the series, so it moves on the series' clock.
    let ownZone = null;
    if (!ov.allDay) ownZone = ov.zone || zone;
    const replaced = new Date(recurrenceInstant(ov.recurrenceId) ?? NaN).toISOString();
    movedOverrides.push({
      ...shiftTimes(ov, days, ownZone),
      recurrenceId: shiftInstant(replaced, days, zone),
    });
  }
  return { base: movedBase, overrides: movedOverrides };
}

/**
 * A date list (EXDATE or RDATE values) split on either side of `at`. A period
 * goes by its start.
 * @param {string[]|null|undefined} values
 * @param {string|null} zone - the series' zone
 * @param {number} at - ms
 */
function datesAround(values, zone, at) {
  /** @type {string[]} */
  const before = [];
  /** @type {string[]} */
  const after = [];
  for (const value of values || []) {
    if (parseExdate(value.split('/')[0], zone).getTime() < at) before.push(value);
    else after.push(value);
  }
  return { before: before.length > 0 ? before : null, after: after.length > 0 ? after : null };
}

/**
 * The part of a series before `split`, capped to end there.
 * @param {object} base - the master event
 * @param {Array<object>} overrides
 * @param {Date} split - the first occurrence left out
 * @returns {{ base: object, overrides: Array<object> }}
 */
function seriesHead(base, overrides, split) {
  const at = split.getTime();
  return {
    base: {
      ...base,
      rrule: setRruleUntil(base.rrule, new Date(at - 1000), base.allDay),
      exdates: datesAround(base.exdates, seriesZone(base), at).before,
      rdates: datesAround(base.rdates, seriesZone(base), at).before,
    },
    overrides: overridesBefore(overrides, split.toISOString()),
  };
}

/**
 * The part of a series from `split` on, as a new series under `uid`. It starts
 * at that occurrence and takes the EXDATEs, RDATEs and overrides from there,
 * and every other line of the master (attendees, alarms, X- properties). It ends
 * where the whole series did: COUNT drops the occurrences left behind, and
 * UNTIL stays as it was.
 * @param {object} base - the master event
 * @param {Array<object>} overrides
 * @param {Date} split - its first occurrence
 * @param {number} before - occurrences of the rule before `split`
 * @param {string} uid
 * @returns {{ base: object, overrides: Array<object> }}
 */
function seriesTail(base, overrides, split, before, uid) {
  const at = split.getTime();
  const duration = Date.parse(base.end) - Date.parse(base.start);
  const tail = {
    ...newResource(base, uid),
    start: split.toISOString(),
    end: new Date(at + duration).toISOString(),
    rrule: base.rrule.replace(/COUNT=(\d+)/i, function remaining(match, count) {
      return `COUNT=${Number(count) - before}`;
    }),
    exdates: datesAround(base.exdates, seriesZone(base), at).after,
    rdates: datesAround(base.rdates, seriesZone(base), at).after,
  };
  const tailOverrides = [];
  for (const ov of overrides) {
    const replaced = recurrenceInstant(ov.recurrenceId);
    if (replaced !== null && replaced >= at) tailOverrides.push(newResource(ov, uid));
  }
  return { base: tail, overrides: tailOverrides };
}

/**
 * A copy of a record for a resource that does not exist yet: a new UID, and
 * no href or etag. A stale etag on the create would be sent as If-Match.
 * @param {object} event
 * @param {string} uid
 */
function newResource(event, uid) {
  const copy = { ...event, uid };
  delete copy.id;
  delete copy.href;
  delete copy.etag;
  return copy;
}

module.exports = { shiftInstant, shiftTimes, shiftSeries, seriesHead, seriesTail };
