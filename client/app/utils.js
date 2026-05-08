/**
 * Format a Date to a time string in the configured timezone.
 * @param {Date} date
 * @param {'24h'|'12h'} format
 * @param {string} timezone - IANA timezone, e.g. 'Europe/Oslo'
 */
export function formatTime(date, format = '24h', timezone = 'UTC') {
  if (format === '12h') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone });
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
  }).formatToParts(date);
  const h = parts.find(p => p.type === 'hour').value;
  const m = parts.find(p => p.type === 'minute').value;
  return `${h === '24' ? '00' : h}:${m}`;
}

/**
 * Return the local calendar date as 'YYYY-MM-DD'.
 * Use this to label a day cell in views — never convert all-day event Dates through this.
 * @param {Date} date - a local-midnight Date (e.g. new Date(year, month, day))
 */
export function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a Date to YYYY-MM-DD for use in <input type="date">,
 * reading the date in the configured timezone.
 * @param {Date} date
 * @param {string} timezone
 */
export function toDateInputValue(date, timezone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone,
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year').value;
  const mo = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${mo}-${d}`;
}

/**
 * Format a Date to HH:MM for use in <input type="time">,
 * reading the time in the configured timezone.
 * @param {Date} date
 * @param {string} timezone
 */
export function toTimeInputValue(date, timezone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
  }).formatToParts(date);
  const h = parts.find(p => p.type === 'hour').value;
  const m = parts.find(p => p.type === 'minute').value;
  return `${h === '24' ? '00' : h}:${m}`;
}

/**
 * Convert a date + time string entered in a given timezone to a UTC Date.
 * Mirrors the server-side floatingToUtc but runs in the browser.
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {string} timeStr - 'HH:MM'
 * @param {string} timezone - IANA timezone
 * @returns {Date}
 */
/**
 * Format a date for display according to the user's date format preference.
 * @param {Date} date  - a local Date object
 * @param {'dmy'|'mdy'|'iso'} format
 * @param {boolean} [includeYear]
 * @returns {string}  e.g. "10 May", "May 10", "05-10"
 */
export function formatShortDate(date, format = 'dmy', includeYear = false) {
  const d  = date.getDate();
  const m  = date.getMonth() + 1;
  const y  = date.getFullYear();
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const monthName = date.toLocaleDateString('en-US', { month: 'short' });

  if (format === 'iso') {
    return includeYear ? `${y}-${mm}-${dd}` : `${mm}-${dd}`;
  }
  if (format === 'mdy') {
    return includeYear ? `${monthName} ${d}, ${y}` : `${monthName} ${d}`;
  }
  // 'dmy' (default)
  return includeYear ? `${d} ${monthName} ${y}` : `${d} ${monthName}`;
}

/**
 * Return weather data for a date if it's within the configured weatherDays window.
 * @param {string} dateStr - 'YYYY-MM-DD'
 * @param {object|null} weather - state.weather
 * @param {number} [maxDays] - how many days ahead to show weather for
 * @returns {{ emoji, tempMax }|null}
 */
function weatherForDate(dateStr, weather, maxDays = 6) {
  if (!weather?.daily?.[dateStr]) return null;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const diffDays = (new Date(dateStr + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000;
  if (diffDays < 0 || diffDays >= maxDays) return null;
  return weather.daily[dateStr];
}

/**
 * Icon + temperature badge for Day view header. Returns '' if no data.
 * @param {string} dateStr
 * @param {object|null} weather
 * @param {number} [maxDays]
 * @returns {string} e.g. "⛅ 14°"
 */
export function weatherBadge(dateStr, weather, maxDays = 6) {
  const d = weatherForDate(dateStr, weather, maxDays);
  if (!d) return '';
  return `${d.emoji} ${d.tempMax}°`;
}

/**
 * Icon-only weather for Month view. Returns '' if no data.
 * @param {string} dateStr
 * @param {object|null} weather
 * @param {number} [maxDays]
 * @returns {string} e.g. "⛅"
 */
export function weatherIcon(dateStr, weather, maxDays = 6) {
  const d = weatherForDate(dateStr, weather, maxDays);
  return d ? d.emoji : '';
}

/**
 * ISO 8601 week number for a given date.
 * @param {Date} date
 * @returns {number}
 */
export function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // Mon=1 .. Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of this ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export function localToUTC(dateStr, timeStr, timezone) {
  // Treat the naive datetime as UTC to parse it, then compute the real offset.
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(naive)) parts[p.type] = p.value;
  const h = parts.hour === '24' ? '00' : parts.hour;
  const asUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}Z`);
  return new Date(naive.getTime() + (naive.getTime() - asUtc.getTime()));
}
