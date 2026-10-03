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

/**
 * @param {string} line - an unfolded content line
 * @returns {{name: string, params: Object<string, string>, value: string}|null}
 */
function parseProperty(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const parts = left.split(';');
  const name = parts[0].toUpperCase();
  /** @type {Object<string, string>} */
  const params = {};
  for (let i = 1; i < parts.length; i++) {
    const eqIdx = parts[i].indexOf('=');
    if (eqIdx !== -1) params[parts[i].slice(0, eqIdx).toUpperCase()] = parts[i].slice(eqIdx + 1);
  }
  return { name, params, value };
}

// Microsoft Exchange/Outlook ICS exports label times with Windows timezone
// names (e.g. "W. Europe Standard Time") instead of IANA zones, which
// Intl.DateTimeFormat rejects. Map the common ones; anything unknown falls back
// to the feed's configured timezone so a single odd TZID never breaks a feed.
const WINDOWS_TZ = {
  UTC: 'UTC',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Central European Standard Time': 'Europe/Warsaw',
  'Romance Standard Time': 'Europe/Paris',
  'FLE Standard Time': 'Europe/Helsinki',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'Russian Standard Time': 'Europe/Moscow',
  'W. Central Africa Standard Time': 'Africa/Lagos',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'India Standard Time': 'Asia/Kolkata',
  'China Standard Time': 'Asia/Shanghai',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'AUS Eastern Standard Time': 'Australia/Sydney',
};

const _tzValidCache = new Map();
function isValidTimezone(tz) {
  if (_tzValidCache.has(tz)) return _tzValidCache.get(tz);
  let ok = true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    ok = false;
  }
  _tzValidCache.set(tz, ok);
  return ok;
}

// Resolve a (possibly Windows-named or quoted) TZID to a valid IANA zone,
// degrading gracefully: TZID → Windows map → fallback timezone → UTC.
function resolveTimezone(tz, fallback) {
  if (!tz) return isValidTimezone(fallback) ? fallback : 'UTC';
  const clean = tz.replace(/^"|"$/g, '');
  if (isValidTimezone(clean)) return clean;
  const mapped = WINDOWS_TZ[clean];
  if (mapped && isValidTimezone(mapped)) return mapped;
  if (isValidTimezone(fallback)) return fallback;
  return 'UTC';
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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(asUtc)) {
    parts[p.type] = p.value;
  }
  const h = parts.hour === '24' ? '00' : parts.hour;
  const shownAsUtc = new Date(
    `${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}Z`,
  );
  return new Date(asUtc.getTime() + (asUtc.getTime() - shownAsUtc.getTime()));
}

function parseIcsDate(value, params = {}, fallbackTz = 'UTC') {
  if (/^\d{8}$/.test(value)) {
    // All-day dates are stored as UTC midnight so the date string is unambiguous
    // in all browser timezones. Never use local midnight here.
    return {
      date: new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`),
      allDay: true,
    };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  if (m[7]) {
    return { date: new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`), allDay: false };
  }
  // Floating or TZID-local time — convert to UTC using TZID param or fallback timezone
  const tz = resolveTimezone(params.TZID, fallbackTz);
  return {
    date: floatingToUtc(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`, tz),
    allDay: false,
  };
}

// Google's ICS export stamps every exported item with a CATEGORIES entry naming
// its own type namespace — CATEGORIES:http://schemas.google.com/g/2005#event.
// It is a machine type marker, not a label anyone chose, and taken at face value
// it turns up as a category in the filter drawer. Anything else is kept as-is.
const VENDOR_SCHEMA_CATEGORY = /^https?:\/\/schemas\.google\.com\//i;

/**
 * Split a CATEGORIES value into labels worth showing.
 * @param {string} [raw] - the raw property value, comma-separated
 * @returns {string[]}
 */
function parseCategories(raw) {
  if (!raw) return [];
  const labels = [];
  for (const part of raw.split(',')) {
    const label = part.trim();
    if (label && !VENDOR_SCHEMA_CATEGORY.test(label)) labels.push(label);
  }
  return labels;
}

function unescapeIcsText(text) {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function escapeIcsText(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
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

// Line and value rules shared by vevent.js and vtodo.js.
module.exports = {
  formatIcsDate,
  parseCategories,
  resolveTimezone,
  floatingToUtc,
  foldLine,
  unfold,
  parseProperty,
  parseIcsDate,
  unescapeIcsText,
  escapeIcsText,
};
