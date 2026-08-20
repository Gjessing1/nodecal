/**
 * @param {number} n
 * @returns {string} n as two digits, e.g. 7 → "07"
 */
export function pad2(n) {
  return String(n).padStart(2, '0');
}
