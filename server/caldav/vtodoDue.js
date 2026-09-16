// Writing a changed due date back into a VTODO another client may have filled
// in more richly than Nodecal models: a time of day and zone on DUE, a DTSTART,
// or a DURATION instead of a DUE. RFC 5545 ties those together — DUE and
// DURATION exclude each other, and DTSTART must share DUE's value type and not
// fall after it — so they are rewritten as one group, changing only what the
// new date forces.

const DATE_TIME = /^\d{8}T\d{6}Z?$/;
const DAY_MS = 86400000;

/**
 * @typedef {Object} IcsProperty
 * @property {string} name - upper-cased
 * @property {Object<string, string>} params
 * @property {string} value
 * @property {string} line - the unfolded line as it arrived
 */

/** Property names this module owns when a task is written back. */
const DUE_PROPERTIES = ['DUE', 'DURATION', 'DTSTART'];

/**
 * The DUE, DURATION and DTSTART lines for a task being written back.
 *
 * An unchanged due date keeps the original lines as they were. A changed one:
 * - moves a DATE-TIME DUE by the same number of days, so a reminder at 09:00
 *   in its own zone is still at 09:00;
 * - otherwise writes a DATE;
 * - drops DURATION, which cannot sit next to a DUE;
 * - keeps DTSTART, converted to DUE's value type if they now differ and pulled
 *   back to the due date if it would start after it.
 * @param {IcsProperty[]} props - the task's original top-level properties
 * @param {string|null} fromDue - 'YYYY-MM-DD' the original DUE parsed to
 * @param {string|null} toDue - 'YYYY-MM-DD' the task is due now
 * @returns {string[]}
 */
function dueLines(props, fromDue, toDue) {
  if ((fromDue || null) === (toDue || null)) {
    const kept = [];
    for (const prop of props) {
      if (DUE_PROPERTIES.includes(prop.name)) kept.push(prop.line);
    }
    return kept;
  }

  const due = lastProperty(props, 'DUE');
  const start = lastProperty(props, 'DTSTART');
  if (!toDue) {
    if (start) return [start.line];
    return [];
  }

  let dueLine = `DUE;VALUE=DATE:${toDue.replace(/-/g, '')}`;
  if (fromDue && due && DATE_TIME.test(due.value)) {
    const days = Math.round(
      (Date.parse(`${toDue}T00:00:00Z`) - Date.parse(`${fromDue}T00:00:00Z`)) / DAY_MS,
    );
    dueLine = withValue(due.line, shiftDate(due.value.slice(0, 8), days) + due.value.slice(8));
  }
  if (!start) return [dueLine];
  return [dueLine, fittedStart(start, dueLine)];
}

/**
 * DTSTART as it can stand next to `dueLine`.
 * @param {IcsProperty} start
 * @param {string} dueLine
 * @returns {string}
 */
function fittedStart(start, dueLine) {
  const dueValue = valueOf(dueLine);
  // "DUE" and "DTSTART" differ only in name, so the rest of the line carries over.
  if (start.value.slice(0, 8) > dueValue.slice(0, 8)) return 'DTSTART' + dueLine.slice(3);
  if (DATE_TIME.test(start.value) === DATE_TIME.test(dueValue)) return start.line;
  // Same or earlier day, other value type: take DUE's form on the start's own date.
  const dueHead = dueLine.slice(3, dueLine.indexOf(':') + 1);
  return 'DTSTART' + dueHead + start.value.slice(0, 8) + dueValue.slice(8);
}

/**
 * @param {IcsProperty[]} props
 * @param {string} name
 * @returns {IcsProperty|null}
 */
function lastProperty(props, name) {
  let found = null;
  for (const prop of props) {
    if (prop.name === name) found = prop;
  }
  return found;
}

/**
 * Replace a content line's value, keeping its name and parameters. Splits at
 * the first colon, as parser.parseProperty does.
 * @param {string} line
 * @param {string} value
 */
function withValue(line, value) {
  return line.slice(0, line.indexOf(':') + 1) + value;
}

/** @param {string} line */
function valueOf(line) {
  return line.slice(line.indexOf(':') + 1);
}

/**
 * @param {string} compact - 'YYYYMMDD'
 * @param {number} days
 * @returns {string} 'YYYYMMDD'
 */
function shiftDate(compact, days) {
  const date = new Date(
    Date.UTC(
      Number(compact.slice(0, 4)),
      Number(compact.slice(4, 6)) - 1,
      Number(compact.slice(6, 8)),
    ),
  );
  date.setUTCDate(date.getUTCDate() + days);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}${month}${day}`;
}

module.exports = { DUE_PROPERTIES, dueLines };
