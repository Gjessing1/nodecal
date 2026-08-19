/**
 * The dial time picker works in Dates, settings store "HH:MM". Both sides are
 * UTC on purpose: these are wall-clock preferences, not instants, so anchoring
 * them to a fixed UTC day keeps them from shifting with the browser offset.
 * @param {string} str - "HH:MM"
 * @returns {Date}
 */
export function timeStrToDate(str) {
  const [h, m] = (str || '09:00').split(':').map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m, 0));
}
