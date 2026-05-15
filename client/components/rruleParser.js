/**
 * @typedef {Object} RecurrenceConfig
 * @property {"daily"|"weekly"|"monthly"|"yearly"} freq
 * @property {number} interval
 * @property {string[]} [byWeekdays]  - "MO","TU","WE","TH","FR","SA","SU"
 * @property {number}  [byMonthDay]   - 1-31
 * @property {number}  [bySetPos]     - -1(last) or 1-4
 * @property {Date}    [until]
 * @property {number}  [count]
 */

export const ALL_DAY_CODES = ['MO','TU','WE','TH','FR','SA','SU'];
export const DAY_LONG = { MO:'Monday',TU:'Tuesday',WE:'Wednesday',TH:'Thursday',FR:'Friday',SA:'Saturday',SU:'Sunday' };
// JS getDay() (0=Sun) → RRULE day code
export const JS_DOW_TO_CODE = ['SU','MO','TU','WE','TH','FR','SA'];
export const WEEKDAYS_SET = new Set(['MO','TU','WE','TH','FR']);

export function ordinal(n) {
  const abs = Math.abs(n);
  const s = abs === 1 ? 'st' : abs === 2 ? 'nd' : abs === 3 ? 'rd' : 'th';
  return n === -1 ? 'last' : abs + s;
}

/**
 * Parse an RRULE string into a RecurrenceConfig.
 * Returns null if the rule is too complex to represent in the structured UI.
 * @param {string|null} str
 * @returns {RecurrenceConfig|null}
 */
export function parseRrule(str) {
  if (!str) return null;
  const parts = {};
  for (const seg of str.split(';')) {
    const eq = seg.indexOf('=');
    if (eq !== -1) parts[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1);
  }

  const freq = parts.FREQ?.toLowerCase();
  if (!['daily','weekly','monthly','yearly'].includes(freq)) return null;

  const known = new Set(['FREQ','INTERVAL','BYDAY','BYMONTHDAY','BYSETPOS','UNTIL','COUNT']);
  if (Object.keys(parts).some(k => !known.has(k))) return null;

  const interval = parseInt(parts.INTERVAL) || 1;

  let byWeekdays = null;
  let bySetPos = null;
  if (parts.BYDAY) {
    const days = parts.BYDAY.split(',');
    const posMatch = days.length === 1 && days[0].match(/^(-?\d+)([A-Z]{2})$/);
    if (posMatch) {
      bySetPos = parseInt(posMatch[1]);
      byWeekdays = [posMatch[2]];
    } else if (days.every(d => ALL_DAY_CODES.includes(d))) {
      byWeekdays = days;
    } else {
      return null;
    }
  }

  if (parts.BYSETPOS && bySetPos === null) {
    const bsArr = parts.BYSETPOS.split(',');
    if (bsArr.length === 1) bySetPos = parseInt(bsArr[0]);
    else return null;
  }

  const byMonthDay = parts.BYMONTHDAY ? parseInt(parts.BYMONTHDAY) : null;

  let until = null;
  if (parts.UNTIL) {
    const u = parts.UNTIL.replace(/[TZ]/g,'');
    until = new Date(`${u.slice(0,4)}-${u.slice(4,6)}-${u.slice(6,8)}T00:00:00`);
  }
  const count = parts.COUNT ? parseInt(parts.COUNT) : null;

  return { freq, interval, byWeekdays, byMonthDay, bySetPos, until, count };
}

/**
 * Serialize a RecurrenceConfig into an RRULE string.
 * @param {RecurrenceConfig} cfg
 * @returns {string}
 */
export function serializeConfig(cfg) {
  const parts = [`FREQ=${cfg.freq.toUpperCase()}`];
  if (cfg.interval > 1) parts.push(`INTERVAL=${cfg.interval}`);
  if (cfg.byWeekdays?.length) {
    if (cfg.bySetPos !== null && cfg.bySetPos !== undefined) {
      parts.push(`BYDAY=${cfg.bySetPos}${cfg.byWeekdays[0]}`);
    } else {
      parts.push(`BYDAY=${cfg.byWeekdays.join(',')}`);
    }
  }
  if (cfg.byMonthDay) parts.push(`BYMONTHDAY=${cfg.byMonthDay}`);
  if (cfg.until) {
    const u = cfg.until;
    const y = u.getFullYear();
    const mo = String(u.getMonth()+1).padStart(2,'0');
    const d  = String(u.getDate()).padStart(2,'0');
    parts.push(`UNTIL=${y}${mo}${d}T000000Z`);
  }
  if (cfg.count) parts.push(`COUNT=${cfg.count}`);
  return parts.join(';');
}

/**
 * Generate a human-readable description of a RecurrenceConfig.
 * @param {RecurrenceConfig|null} cfg
 * @returns {string}
 */
export function humanReadable(cfg) {
  if (!cfg) return '';
  const days = cfg.byWeekdays || [];
  let base = '';
  if (cfg.freq === 'daily') {
    base = cfg.interval === 1 ? 'Repeats daily' : `Repeats every ${cfg.interval} days`;
  } else if (cfg.freq === 'weekly') {
    if (days.length === 5 && days.every(d => WEEKDAYS_SET.has(d))) {
      base = 'Repeats every weekday (Mon–Fri)';
    } else {
      const n = cfg.interval === 1 ? 'every week' : `every ${cfg.interval} weeks`;
      const dayStr = days.map(d => DAY_LONG[d]).join(' and ');
      base = dayStr ? `Repeats ${n} on ${dayStr}` : `Repeats ${n}`;
    }
  } else if (cfg.freq === 'monthly') {
    if (cfg.bySetPos !== null && cfg.bySetPos !== undefined && days.length) {
      base = `Repeats every month on the ${ordinal(cfg.bySetPos)} ${DAY_LONG[days[0]]}`;
    } else if (cfg.byMonthDay) {
      base = `Repeats on the ${ordinal(cfg.byMonthDay)} of each month`;
    } else {
      base = 'Repeats monthly';
    }
  } else if (cfg.freq === 'yearly') {
    base = cfg.interval === 1 ? 'Repeats yearly' : `Repeats every ${cfg.interval} years`;
  }

  const suffix = cfg.count
    ? `Ends after ${cfg.count} occurrence${cfg.count === 1 ? '' : 's'}`
    : cfg.until
      ? `Ends on ${cfg.until.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}`
      : '';
  return suffix ? `${base} · ${suffix}` : base;
}
