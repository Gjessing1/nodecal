const CRLF = '\r\n';

// RFC 5545 §3.1: fold long content lines at 75 octets
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let pos = 75;
  while (pos < line.length) {
    parts.push(' ' + line.slice(pos, pos + 74));
    pos += 74;
  }
  return parts.join(CRLF);
}

function unfold(icsText) {
  return icsText.replace(/\r?\n[ \t]/g, '');
}

function parseProperty(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const parts = left.split(';');
  const name = parts[0].toUpperCase();
  const params = {};
  for (let i = 1; i < parts.length; i++) {
    const eqIdx = parts[i].indexOf('=');
    if (eqIdx !== -1) params[parts[i].slice(0, eqIdx).toUpperCase()] = parts[i].slice(eqIdx + 1);
  }
  return { name, params, value };
}

/**
 * Convert a floating local datetime string ("YYYY-MM-DDTHH:MM:SS") to a UTC Date
 * by computing the offset for `timezone` at that approximate instant.
 */
function floatingToUtc(dateStr, timezone) {
  const asUtc = new Date(dateStr + 'Z');
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(asUtc)) {
    parts[p.type] = p.value;
  }
  const h = parts.hour === '24' ? '00' : parts.hour;
  const shownAsUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}Z`);
  return new Date(asUtc.getTime() + (asUtc - shownAsUtc));
}

function parseIcsDate(value, params = {}, fallbackTz = 'UTC') {
  if (/^\d{8}$/.test(value)) {
    // All-day dates are stored as UTC midnight so the date string is unambiguous
    // in all browser timezones. Never use local midnight here.
    return { date: new Date(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T00:00:00Z`), allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  if (m[7]) {
    return { date: new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`), allDay: false };
  }
  // Floating or TZID-local time — convert to UTC using TZID param or fallback timezone
  const tz = params.TZID || fallbackTz;
  return { date: floatingToUtc(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`, tz), allDay: false };
}

function parseDuration(dur) {
  const m = dur.match(/^-?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const w = parseInt(m[1] || 0), d = parseInt(m[2] || 0);
  const h = parseInt(m[3] || 0), min = parseInt(m[4] || 0), s = parseInt(m[5] || 0);
  return ((w * 7 + d) * 86400 + h * 3600 + min * 60 + s) * 1000;
}

function unescapeIcsText(text) {
  return text.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function escapeIcsText(text) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Parse a VCALENDAR ICS string into an array of event objects.
 * @param {string} icsText
 * @param {{ timezone?: string }} [opts]
 * @returns {Array<{uid, title, start, end, allDay, description, location}>}
 */
function parseIcs(icsText, { timezone = 'UTC' } = {}) {
  const unfolded = unfold(icsText);
  const events = [];
  const veventRe = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;
  while ((match = veventRe.exec(unfolded)) !== null) {
    const props = {};
    for (const line of match[1].split(/\r?\n/).filter(Boolean)) {
      const prop = parseProperty(line);
      if (prop) props[prop.name] = prop;
    }
    const uid = props.UID?.value;
    if (!uid) continue;
    const startInfo = props.DTSTART ? parseIcsDate(props.DTSTART.value, props.DTSTART.params, timezone) : null;
    if (!startInfo) continue;

    let endDate = null;
    if (props.DTEND) {
      endDate = parseIcsDate(props.DTEND.value, props.DTEND.params, timezone)?.date;
    } else if (props.DURATION) {
      endDate = new Date(startInfo.date.getTime() + parseDuration(props.DURATION.value));
    } else {
      endDate = new Date(startInfo.date.getTime() + (startInfo.allDay ? 86400000 : 3600000));
    }

    // Parse VALARM sub-component (first one found wins)
    let alarmMinutes = null;
    const valarmRe = /BEGIN:VALARM([\s\S]*?)END:VALARM/g;
    let vm;
    while ((vm = valarmRe.exec(match[1])) !== null && alarmMinutes === null) {
      for (const vline of vm[1].split(/\r?\n/).filter(Boolean)) {
        if (/^TRIGGER/i.test(vline)) {
          const vp = parseProperty(vline);
          if (vp) {
            const m2 = vp.value.match(/-P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/i);
            if (m2) {
              const d2 = parseInt(m2[1] || 0), h2 = parseInt(m2[2] || 0), min2 = parseInt(m2[3] || 0);
              alarmMinutes = d2 * 1440 + h2 * 60 + min2;
            }
          }
        }
      }
    }

    // Collect EXDATE values (may appear multiple times, may be comma-separated)
    const exdates = [];
    for (const line of match[1].split(/\r?\n/).filter(Boolean)) {
      if (/^EXDATE/i.test(line)) {
        const prop = parseProperty(line);
        if (prop) for (const v of prop.value.split(',')) exdates.push(v.trim());
      }
    }

    const rawCats = props.CATEGORIES?.value || '';
    const categories = rawCats
      ? rawCats.split(',').map(c => c.trim()).filter(Boolean)
      : [];

    events.push({
      uid,
      title: unescapeIcsText(props.SUMMARY?.value || '(No title)'),
      start: startInfo.date.toISOString(),
      end: (endDate || startInfo.date).toISOString(),
      allDay: startInfo.allDay,
      description: unescapeIcsText(props.DESCRIPTION?.value || ''),
      location: unescapeIcsText(props.LOCATION?.value || ''),
      url: unescapeIcsText(props.URL?.value || ''),
      categories,
      rrule: props.RRULE?.value || null,
      exdates: exdates.length > 0 ? exdates : null,
      recurrenceId: props['RECURRENCE-ID']?.value || null,
      alarmMinutes: alarmMinutes ?? null,
    });
  }
  return events;
}

function formatIcsDate(date, allDay) {
  if (allDay) {
    // All-day dates are stored as UTC midnight — read UTC parts to recover the correct calendar date.
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
  return date.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}

/**
 * Serialize an event object into a full VCALENDAR ICS string.
 * Supports: rrule, exdates, recurrenceId in addition to base fields.
 * @param {object} event
 * @returns {string}
 */
function serializeEvent(event) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nodecal//EN',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)}Z`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DTSTART${event.allDay ? ';VALUE=DATE' : ''}:${formatIcsDate(new Date(event.start), event.allDay)}`,
    `DTEND${event.allDay ? ';VALUE=DATE' : ''}:${formatIcsDate(new Date(event.end), event.allDay)}`,
  ];
  if (event.categories?.length) lines.push(`CATEGORIES:${event.categories.join(',')}`);
  if (event.rrule) lines.push(`RRULE:${event.rrule}`);
  if (event.exdates?.length) {
    for (const ex of event.exdates) lines.push(`${event.allDay ? 'EXDATE;VALUE=DATE:' : 'EXDATE:'}${ex}`);
  }
  if (event.recurrenceId) {
    lines.push(`RECURRENCE-ID:${formatIcsDate(new Date(event.recurrenceId), event.allDay)}`);
  }
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  if (event.alarmMinutes > 0) {
    const am = event.alarmMinutes;
    const trigger = am >= 1440 && am % 1440 === 0 ? `-P${am / 1440}D`
      : am >= 60 && am % 60 === 0 ? `-PT${am / 60}H`
      : `-PT${am}M`;
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', `TRIGGER:${trigger}`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/**
 * Parse a VCALENDAR ICS string into an array of task objects (VTODO).
 * @param {string} icsText
 * @returns {Array}
 */
function parseVtodo(icsText) {
  const unfolded = unfold(icsText);
  const result = [];
  const re = /BEGIN:VTODO([\s\S]*?)END:VTODO/g;
  let match;
  while ((match = re.exec(unfolded)) !== null) {
    const props = {};
    for (const line of match[1].split(/\r?\n/).filter(Boolean)) {
      const prop = parseProperty(line);
      if (prop) props[prop.name] = prop;
    }
    const uid = props.UID?.value;
    if (!uid) continue;

    // DUE — prefer date-only; fall back to full datetime truncated to date
    let due = null;
    if (props.DUE) {
      const val = props.DUE.value;
      if (/^\d{8}$/.test(val)) {
        due = `${val.slice(0,4)}-${val.slice(4,6)}-${val.slice(6,8)}`;
      } else {
        const parsed = parseIcsDate(val, props.DUE.params);
        if (parsed) due = parsed.date.toISOString().slice(0, 10);
      }
    }

    let completed = null;
    if (props.COMPLETED) {
      const parsed = parseIcsDate(props.COMPLETED.value, props.COMPLETED.params);
      if (parsed) completed = parsed.date.toISOString();
    }

    const categories = props.CATEGORIES?.value
      ? props.CATEGORIES.value.split(',').map(c => c.trim()).filter(Boolean)
      : [];

    result.push({
      uid,
      type: 'task',
      title: unescapeIcsText(props.SUMMARY?.value || '(No title)'),
      description: unescapeIcsText(props.DESCRIPTION?.value || ''),
      location: unescapeIcsText(props.LOCATION?.value || ''),
      url: unescapeIcsText(props.URL?.value || ''),
      status: props.STATUS?.value || 'NEEDS-ACTION',
      due,
      completed,
      categories,
      rrule: props.RRULE?.value || null,
      xRecurringType: props['X-RECURRING-TYPE']?.value || null,
      xRecurringInterval: props['X-RECURRING-INTERVAL']?.value || null,
      taskReminder: props['X-REMINDER']?.value || null,
    });
  }
  return result;
}

/**
 * Serialize a task object into a full VCALENDAR ICS string (VTODO).
 * @param {object} task
 * @returns {string}
 */
function serializeTask(task) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nodecal//EN',
    'BEGIN:VTODO',
    `UID:${task.uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g,'').slice(0,15)}Z`,
    `SUMMARY:${escapeIcsText(task.title || '')}`,
    `STATUS:${task.status || 'NEEDS-ACTION'}`,
  ];
  if (task.due) lines.push(`DUE;VALUE=DATE:${task.due.replace(/-/g, '')}`);
  if (task.completed) {
    const dt = new Date(task.completed).toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
    lines.push(`COMPLETED:${dt}`);
  }
  if (task.categories?.length) lines.push(`CATEGORIES:${task.categories.join(',')}`);
  if (task.rrule) lines.push(`RRULE:${task.rrule}`);
  if (task.xRecurringType) lines.push(`X-RECURRING-TYPE:${task.xRecurringType}`);
  if (task.xRecurringInterval) lines.push(`X-RECURRING-INTERVAL:${task.xRecurringInterval}`);
  if (task.taskReminder && task.taskReminder !== 'none') lines.push(`X-REMINDER:${task.taskReminder}`);
  if (task.location) lines.push(`LOCATION:${escapeIcsText(task.location)}`);
  if (task.url) lines.push(`URL:${task.url}`);
  if (task.description) lines.push(`DESCRIPTION:${escapeIcsText(task.description)}`);
  lines.push('END:VTODO', 'END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

module.exports = { parseIcs, serializeEvent, formatIcsDate, parseVtodo, serializeTask };
