const CRLF = '\r\n';

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

function parseIcsDate(value, params = {}) {
  if (/^\d{8}$/.test(value)) {
    return { date: new Date(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T00:00:00`), allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  return {
    date: new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? 'Z' : ''}`),
    allDay: false,
  };
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
 * @returns {Array<{uid, title, start, end, allDay, description, location}>}
 */
function parseIcs(icsText) {
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
    const startInfo = props.DTSTART ? parseIcsDate(props.DTSTART.value, props.DTSTART.params) : null;
    if (!startInfo) continue;

    let endDate = null;
    if (props.DTEND) {
      endDate = parseIcsDate(props.DTEND.value, props.DTEND.params)?.date;
    } else if (props.DURATION) {
      endDate = new Date(startInfo.date.getTime() + parseDuration(props.DURATION.value));
    } else {
      endDate = new Date(startInfo.date.getTime() + (startInfo.allDay ? 86400000 : 3600000));
    }

    // Collect EXDATE values (may appear multiple times, may be comma-separated)
    const exdates = [];
    for (const line of match[1].split(/\r?\n/).filter(Boolean)) {
      if (/^EXDATE/i.test(line)) {
        const prop = parseProperty(line);
        if (prop) for (const v of prop.value.split(',')) exdates.push(v.trim());
      }
    }

    events.push({
      uid,
      title: unescapeIcsText(props.SUMMARY?.value || '(No title)'),
      start: startInfo.date.toISOString(),
      end: (endDate || startInfo.date).toISOString(),
      allDay: startInfo.allDay,
      description: unescapeIcsText(props.DESCRIPTION?.value || ''),
      location: unescapeIcsText(props.LOCATION?.value || ''),
      rrule: props.RRULE?.value || null,
      exdates: exdates.length > 0 ? exdates : null,
      recurrenceId: props['RECURRENCE-ID']?.value || null,
    });
  }
  return events;
}

function formatIcsDate(date, allDay) {
  if (allDay) {
    // Use LOCAL date parts — the date object was built from local midnight, so UTC
    // values would be the previous day in positive-offset timezones (e.g. UTC+2).
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
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
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DTSTART${event.allDay ? ';VALUE=DATE' : ''}:${formatIcsDate(new Date(event.start), event.allDay)}`,
    `DTEND${event.allDay ? ';VALUE=DATE' : ''}:${formatIcsDate(new Date(event.end), event.allDay)}`,
  ];
  if (event.rrule) lines.push(`RRULE:${event.rrule}`);
  if (event.exdates?.length) {
    for (const ex of event.exdates) lines.push(`EXDATE:${ex}`);
  }
  if (event.recurrenceId) {
    lines.push(`RECURRENCE-ID:${formatIcsDate(new Date(event.recurrenceId), event.allDay)}`);
  }
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}

module.exports = { parseIcs, serializeEvent, formatIcsDate };
