/**
 * Format a Date to a time string respecting the configured time format.
 * @param {Date} date
 * @param {'24h'|'12h'} format
 */
export function formatTime(date, format = '24h') {
  if (format === '12h') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Format a Date to YYYY-MM-DD for use in <input type="date">.
 * @param {Date} date
 */
export function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a Date to HH:MM for use in <input type="time">.
 * @param {Date} date
 */
export function toTimeInputValue(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
