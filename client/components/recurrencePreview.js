import { state } from '../app/state.js';

async function loadRRule() {
  if (window._rruleModule) return window._rruleModule;
  try {
    const m = await import('/rrule/index.js');
    window._rruleModule = m;
    return m;
  } catch { return null; }
}

/**
 * Compute the next up-to-6 occurrences of an RRULE starting from startDate.
 * @param {string} rruleStr
 * @param {Date} startDate
 * @returns {Promise<Date[]>}
 */
export async function getOccurrences(rruleStr, startDate) {
  if (!rruleStr) return [];
  const mod = await loadRRule();
  if (!mod) return [];
  try {
    const { rrulestr } = mod;
    const y = startDate.getFullYear();
    const mo = String(startDate.getMonth()+1).padStart(2,'0');
    const d  = String(startDate.getDate()).padStart(2,'0');
    const rule = rrulestr(`DTSTART;VALUE=DATE:${y}${mo}${d}\nRRULE:${rruleStr}`);
    const cutoff = new Date(startDate.getTime() + 24 * 30 * 86400000);
    return rule.between(startDate, cutoff, true).slice(0, 6);
  } catch { return []; }
}

/**
 * Build a compact mini-calendar showing occurrence dots.
 * @param {Date[]} occurrences
 * @returns {HTMLElement}
 */
export function buildMiniCal(occurrences) {
  const wrap = document.createElement('div');
  wrap.className = 'rec-preview-cal';
  if (!occurrences.length) return wrap;

  const startOnMonday = state.config.weekStart !== 'sunday';
  const dayNames = startOnMonday
    ? ['Mo','Tu','We','Th','Fr','Sa','Su']
    : ['Su','Mo','Tu','We','Th','Fr','Sa'];

  // Collect unique months containing occurrences (max 3)
  const months = [];
  const seen = new Set();
  for (const d of occurrences) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!seen.has(key) && months.length < 3) { seen.add(key); months.push({ y: d.getFullYear(), m: d.getMonth() }); }
  }

  const occSet = new Set(occurrences.map(d =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  ));

  for (const { y, m } of months) {
    const header = document.createElement('div');
    header.className = 'rec-cal-header';
    header.textContent = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    wrap.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'rec-cal-grid';

    for (const name of dayNames) {
      const h = document.createElement('div');
      h.className = 'rec-cal-wday';
      h.textContent = name;
      grid.appendChild(h);
    }

    const firstDow = new Date(y, m, 1).getDay();
    const offset   = startOnMonday ? (firstDow === 0 ? 6 : firstDow - 1) : firstDow;
    const daysInM  = new Date(y, m + 1, 0).getDate();

    for (let i = 0; i < offset; i++) {
      const e = document.createElement('div');
      e.className = 'rec-cal-cell';
      grid.appendChild(e);
    }
    for (let day = 1; day <= daysInM; day++) {
      const key = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const cell = document.createElement('div');
      cell.className = 'rec-cal-cell' + (occSet.has(key) ? ' rec-cal-occ' : '');
      cell.textContent = day;
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
  }
  return wrap;
}
