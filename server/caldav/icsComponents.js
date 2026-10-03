const { unfold, parseProperty } = require('./parser');

// Reading a component as the lines it arrived with, so writing it back can
// keep what Nodecal does not model. Shared by VEVENT (vevent.js) and VTODO
// (vtodo.js) writes.

/**
 * @typedef {Object} IcsProperty
 * @property {string} name - upper-cased
 * @property {Object<string, string>} params
 * @property {string} value
 * @property {string} line - the unfolded line as it arrived
 */

/**
 * The components of one kind in a document, each as its unfolded content lines
 * (without its own BEGIN/END), plus every VTIMEZONE block whole.
 * @param {string} icsText
 * @param {'VEVENT'|'VTODO'} name
 * @returns {{ components: string[][], timezones: string[] }}
 */
function readCalendar(icsText, name) {
  /** @type {string[][]} */
  const components = [];
  /** @type {string[]} */
  const timezones = [];
  let open = '';
  let depth = 0;
  /** @type {string[]} */
  let body = [];
  for (const line of unfold(icsText).split(/\r?\n/)) {
    if (!line) continue;
    const upper = line.toUpperCase();
    if (!open) {
      if (upper === `BEGIN:${name}` || upper === 'BEGIN:VTIMEZONE') {
        open = upper.slice('BEGIN:'.length);
        depth = 0;
        body = [];
      }
      continue;
    }
    if (depth === 0 && upper === `END:${open}`) {
      if (open === name) components.push(body);
      else timezones.push(`BEGIN:${open}`, ...body, `END:${open}`);
      open = '';
      continue;
    }
    if (upper.startsWith('BEGIN:')) depth++;
    if (upper.startsWith('END:')) depth--;
    body.push(line);
  }
  return { components, timezones };
}

/**
 * Split a component body into its own properties and the components nested in
 * it, which are kept whole: a VALARM's DESCRIPTION is not the event's.
 * @param {string[]} body
 * @returns {{ props: IcsProperty[], nested: string[] }}
 */
function splitComponent(body) {
  /** @type {IcsProperty[]} */
  const props = [];
  /** @type {string[]} */
  const nested = [];
  let depth = 0;
  for (const line of body) {
    const upper = line.toUpperCase();
    if (upper.startsWith('BEGIN:')) depth++;
    if (depth > 0) {
      nested.push(line);
    } else {
      const prop = parseProperty(line);
      if (prop) props.push({ ...prop, line });
    }
    if (upper.startsWith('END:')) depth--;
  }
  return { props, nested };
}

/**
 * Whether a field still holds what the original lines parse to. Values are
 * compared as text so a stored 3 and a parsed "3" agree, and a missing value
 * matches an empty one.
 * @param {*} before
 * @param {*} after
 */
function sameValue(before, after) {
  if (Array.isArray(before) || Array.isArray(after)) {
    return JSON.stringify(before || []) === JSON.stringify(after || []);
  }
  return String(before ?? '') === String(after ?? '');
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

module.exports = { readCalendar, splitComponent, sameValue, lastProperty };
