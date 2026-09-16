const {
  foldLine,
  unfold,
  parseProperty,
  parseIcsDate,
  parseCategories,
  unescapeIcsText,
  escapeIcsText,
} = require('./parser');
const { DUE_PROPERTIES, dueLines } = require('./vtodoDue');

// Tasks as VTODOs. Nodecal models a subset of a VTODO, but the resource belongs
// to every client syncing the collection: Tasks.org, Apple Reminders and
// Thunderbird write alarms, subtasks, start dates and progress that Nodecal
// never shows. So a task keeps the lines it was read from (`rawVtodo`), and
// writing it back replaces only the properties whose field changed.

const CRLF = '\r\n';

/**
 * The properties each task field is read from. A field that still matches what
 * its properties parse to is written back as the original lines. DUE, DURATION
 * and DTSTART are handled as a group in vtodoDue.js.
 * @type {Object<string, string[]>}
 */
const FIELD_PROPERTIES = {
  title: ['SUMMARY'],
  description: ['DESCRIPTION'],
  location: ['LOCATION'],
  url: ['URL'],
  status: ['STATUS'],
  priority: ['PRIORITY'],
  completed: ['COMPLETED'],
  categories: ['CATEGORIES'],
  rrule: ['RRULE'],
  xRecurringType: ['X-RECURRING-TYPE'],
  xRecurringInterval: ['X-RECURRING-INTERVAL'],
  taskReminder: ['X-REMINDER'],
  sortOrder: ['X-APPLE-SORT-ORDER'],
};

// Rewritten on every save: they describe the write, not the task.
const STAMP_PROPERTIES = ['UID', 'DTSTAMP', 'LAST-MODIFIED'];

/**
 * @typedef {import('./vtodoDue').IcsProperty} IcsProperty
 */

/**
 * Parse a VCALENDAR ICS string into an array of task objects (VTODO).
 * @param {string} icsText
 * @returns {Array<object>}
 */
function parseVtodo(icsText) {
  const { todos, timezones } = readCalendar(icsText);
  const result = [];
  for (const body of todos) {
    const { props } = splitTodo(body);
    const uid = lastValue(props, 'UID');
    if (!uid) continue;
    result.push({
      uid,
      type: 'task',
      ...todoFields(props),
      rawVtodo: body,
      rawTimezones: timezones,
    });
  }
  return result;
}

/**
 * RFC 5545 PRIORITY: 1 is highest, 9 lowest, 0 undefined. Anything outside that
 * range (or missing) reads as undefined rather than being clamped into a level
 * the author never chose.
 * @param {string|undefined} raw
 * @returns {number}
 */
function parsePriority(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 9) return 0;
  return value;
}

/**
 * Serialize a task into a full VCALENDAR ICS string (VTODO). A task read from
 * CalDAV keeps every line it arrived with except the fields that changed; a new
 * one (no `rawVtodo`) is written from its fields alone.
 * @param {object} task
 * @returns {string}
 */
function serializeTask(task) {
  const hasRaw = Array.isArray(task.rawVtodo);
  const { props, nested } = splitTodo(hasRaw ? task.rawVtodo : []);
  const original = todoFields(props);
  const stamp = icsUtc(new Date().toISOString());

  /** @type {Set<string>} */
  const changed = new Set();
  for (const field of Object.keys(FIELD_PROPERTIES)) {
    if (!hasRaw || !sameValue(original[field], task[field])) changed.add(field);
  }

  const lines = [`UID:${task.uid}`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${stamp}`];
  if (!hasRaw && task.createdAt) lines.push(`CREATED:${icsUtc(task.createdAt)}`);
  for (const prop of props) {
    if (STAMP_PROPERTIES.includes(prop.name) || DUE_PROPERTIES.includes(prop.name)) continue;
    const field = fieldOf(prop.name);
    if (field && changed.has(field)) continue;
    lines.push(prop.line);
  }
  for (const field of changed) lines.push(...fieldLines(field, task));
  lines.push(...dueLines(props, hasRaw ? original.due : null, task.due || null));
  // Components (VALARM) come after every property of the VTODO.
  lines.push(...nested);

  const calendar = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nodecal//EN'];
  // A DTSTART or DUE kept with a TZID still needs its VTIMEZONE.
  if (hasRaw && Array.isArray(task.rawTimezones)) calendar.push(...task.rawTimezones);
  calendar.push('BEGIN:VTODO', ...lines, 'END:VTODO', 'END:VCALENDAR');
  return calendar.map(foldLine).join(CRLF) + CRLF;
}

/**
 * The task fields a VTODO's own properties describe.
 * @param {IcsProperty[]} props
 */
function todoFields(props) {
  const byName = {};
  const categoryValues = [];
  for (const prop of props) {
    byName[prop.name] = prop;
    // Clients may split categories over several lines; they all count.
    if (prop.name === 'CATEGORIES') categoryValues.push(prop.value);
  }

  // DUE — prefer date-only; fall back to full datetime truncated to date
  let due = null;
  if (byName.DUE) {
    const val = byName.DUE.value;
    if (/^\d{8}$/.test(val)) {
      due = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
    } else {
      const parsed = parseIcsDate(val, byName.DUE.params);
      if (parsed) due = parsed.date.toISOString().slice(0, 10);
    }
  }

  return {
    title: unescapeIcsText(byName.SUMMARY?.value || '(No title)'),
    description: unescapeIcsText(byName.DESCRIPTION?.value || ''),
    location: unescapeIcsText(byName.LOCATION?.value || ''),
    url: unescapeIcsText(byName.URL?.value || ''),
    status: byName.STATUS?.value || 'NEEDS-ACTION',
    priority: parsePriority(byName.PRIORITY?.value),
    due,
    completed: parseUtc(byName.COMPLETED),
    createdAt: parseUtc(byName.CREATED),
    categories: parseCategories(categoryValues.join(',')),
    rrule: byName.RRULE?.value || null,
    xRecurringType: byName['X-RECURRING-TYPE']?.value || null,
    xRecurringInterval: byName['X-RECURRING-INTERVAL']?.value || null,
    taskReminder: byName['X-REMINDER']?.value || null,
    sortOrder: parseSortOrder(byName['X-APPLE-SORT-ORDER']?.value),
  };
}

/**
 * The lines a changed field is written as.
 * @param {string} field - a key of FIELD_PROPERTIES
 * @param {object} task
 * @returns {string[]}
 */
function fieldLines(field, task) {
  if (field === 'title') return [`SUMMARY:${escapeIcsText(task.title || '')}`];
  if (field === 'status') return [`STATUS:${task.status || 'NEEDS-ACTION'}`];
  if (field === 'description' && task.description) {
    return [`DESCRIPTION:${escapeIcsText(task.description)}`];
  }
  if (field === 'location' && task.location) return [`LOCATION:${escapeIcsText(task.location)}`];
  if (field === 'url' && task.url) return [`URL:${task.url}`];
  if (field === 'priority' && task.priority) return [`PRIORITY:${task.priority}`];
  if (field === 'completed' && task.completed) return [`COMPLETED:${icsUtc(task.completed)}`];
  if (field === 'categories' && task.categories?.length) {
    return [`CATEGORIES:${task.categories.join(',')}`];
  }
  if (field === 'rrule' && task.rrule) return [`RRULE:${task.rrule}`];
  if (field === 'xRecurringType' && task.xRecurringType) {
    return [`X-RECURRING-TYPE:${task.xRecurringType}`];
  }
  if (field === 'xRecurringInterval' && task.xRecurringInterval) {
    return [`X-RECURRING-INTERVAL:${task.xRecurringInterval}`];
  }
  if (field === 'taskReminder' && task.taskReminder && task.taskReminder !== 'none') {
    return [`X-REMINDER:${task.taskReminder}`];
  }
  if (field === 'sortOrder' && Number.isSafeInteger(task.sortOrder)) {
    return [`X-APPLE-SORT-ORDER:${task.sortOrder}`];
  }
  return [];
}

/**
 * The VTODOs in a document, each as its unfolded content lines (without its
 * own BEGIN/END), plus every VTIMEZONE block whole.
 * @param {string} icsText
 * @returns {{ todos: string[][], timezones: string[] }}
 */
function readCalendar(icsText) {
  /** @type {string[][]} */
  const todos = [];
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
      if (upper === 'BEGIN:VTODO' || upper === 'BEGIN:VTIMEZONE') {
        open = upper.slice('BEGIN:'.length);
        depth = 0;
        body = [];
      }
      continue;
    }
    if (depth === 0 && upper === `END:${open}`) {
      if (open === 'VTODO') todos.push(body);
      else timezones.push(`BEGIN:${open}`, ...body, `END:${open}`);
      open = '';
      continue;
    }
    if (upper.startsWith('BEGIN:')) depth++;
    if (upper.startsWith('END:')) depth--;
    body.push(line);
  }
  return { todos, timezones };
}

/**
 * Split a VTODO body into its own properties and the components nested in it,
 * which are kept whole: a VALARM's DESCRIPTION is not the task's.
 * @param {string[]} body
 * @returns {{ props: IcsProperty[], nested: string[] }}
 */
function splitTodo(body) {
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
 * @param {string} name
 * @returns {string|null} the task field the property feeds
 */
function fieldOf(name) {
  for (const [field, names] of Object.entries(FIELD_PROPERTIES)) {
    if (names.includes(name)) return field;
  }
  return null;
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
 */
function lastValue(props, name) {
  let value;
  for (const prop of props) {
    if (prop.name === name) value = prop.value;
  }
  return value;
}

/**
 * @param {IcsProperty|undefined} prop
 * @returns {string|null} ISO string
 */
function parseUtc(prop) {
  if (!prop) return null;
  const parsed = parseIcsDate(prop.value, prop.params);
  if (!parsed) return null;
  return parsed.date.toISOString();
}

/**
 * X-APPLE-SORT-ORDER is an integer; Tasks.org reads it as a Long.
 * @param {string|undefined} raw
 * @returns {number|null}
 */
function parseSortOrder(raw) {
  if (!raw || !/^\s*-?\d+\s*$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

/**
 * @param {string} iso
 * @returns {string} e.g. 20260916T093000Z
 */
function icsUtc(iso) {
  return new Date(iso).toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

module.exports = { parseVtodo, parsePriority, serializeTask };
