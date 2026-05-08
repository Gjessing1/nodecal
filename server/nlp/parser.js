const chrono = require('chrono-node');

const RECURRENCE = [
  [/every\s+day\b|daily\b/i,     'FREQ=DAILY'],
  [/every\s+week\b|weekly\b/i,   'FREQ=WEEKLY'],
  [/every\s+month\b|monthly\b/i, 'FREQ=MONTHLY'],
  [/every\s+year\b|yearly\b|annually\b/i, 'FREQ=YEARLY'],
  [/every\s+monday/i,    'FREQ=WEEKLY;BYDAY=MO'],
  [/every\s+tuesday/i,   'FREQ=WEEKLY;BYDAY=TU'],
  [/every\s+wednesday/i, 'FREQ=WEEKLY;BYDAY=WE'],
  [/every\s+thursday/i,  'FREQ=WEEKLY;BYDAY=TH'],
  [/every\s+friday/i,    'FREQ=WEEKLY;BYDAY=FR'],
  [/every\s+saturday/i,  'FREQ=WEEKLY;BYDAY=SA'],
  [/every\s+sunday/i,    'FREQ=WEEKLY;BYDAY=SU'],
  // Norwegian days
  [/hver\s+mandag/i,   'FREQ=WEEKLY;BYDAY=MO'],
  [/hver\s+tirsdag/i,  'FREQ=WEEKLY;BYDAY=TU'],
  [/hver\s+onsdag/i,   'FREQ=WEEKLY;BYDAY=WE'],
  [/hver\s+torsdag/i,  'FREQ=WEEKLY;BYDAY=TH'],
  [/hver\s+fredag/i,   'FREQ=WEEKLY;BYDAY=FR'],
  [/hver\s+l[øo]rdag/i,'FREQ=WEEKLY;BYDAY=SA'],
  [/hver\s+s[øo]ndag/i,'FREQ=WEEKLY;BYDAY=SU'],
  [/hver\s+dag\b|daglig\b/i, 'FREQ=DAILY'],
  [/hver\s+uke\b|ukentlig\b/i, 'FREQ=WEEKLY'],
];

// Short hour-range patterns not handled by chrono-node: "18-21" → "18:00-21:00"
// Also "kl. 14" / "klokken 14" → "14:00"
function normalizeTimeRanges(text) {
  // "18-21", "18:00-21", "18-21:00", "9-11" → "18:00-21:00" (hours 0-23 only)
  let t = text.replace(/\b([01]?\d|2[0-3])(?::(\d{2}))?\s*[-–]\s*([01]?\d|2[0-3])(?::(\d{2}))?\b/g,
    (_, h1, m1, h2, m2) => {
      const start = `${h1.padStart(2,'0')}:${m1 || '00'}`;
      const end   = `${h2.padStart(2,'0')}:${m2 || '00'}`;
      // Only expand if it looks like a time range (not e.g. "2-3 people")
      const h1n = parseInt(h1), h2n = parseInt(h2);
      if (h1n > 23 || h2n > 23 || h2n <= h1n) return _;
      return `${start}-${end}`;
    });
  // "kl. 14" / "kl 14" / "klokken 14" → "at 14:00"
  t = t.replace(/kl\.?\s+([01]?\d|2[0-3])(?::(\d{2}))?/gi,
    (_, h, m) => `at ${h.padStart(2,'0')}:${m || '00'}`);
  t = t.replace(/klokken\s+([01]?\d|2[0-3])(?::(\d{2}))?/gi,
    (_, h, m) => `at ${h.padStart(2,'0')}:${m || '00'}`);
  return t;
}

// Norwegian date words → English
const NO_TO_EN_EVENT = [
  [/\bi morgen\b/gi, 'tomorrow'],
  [/\bimorgen\b/gi, 'tomorrow'],
  [/\bi dag\b/gi, 'today'],
  [/\bidag\b/gi, 'today'],
  [/\bmandag\b/gi, 'monday'],
  [/\btirsdag\b/gi, 'tuesday'],
  [/\bonsdag\b/gi, 'wednesday'],
  [/\btorsdag\b/gi, 'thursday'],
  [/\bfredag\b/gi, 'friday'],
  [/\bl[øo]rdag\b/gi, 'saturday'],
  [/\bs[øo]ndag\b/gi, 'sunday'],
  [/\bneste\b/gi, 'next'],
  [/\bjan(?:uar)?\b/gi, 'january'],
  [/\bfeb(?:ruar)?\b/gi, 'february'],
  [/\bmars\b/gi, 'march'],
  [/\bapr(?:il)?\b/gi, 'april'],
  [/\bmai\b/gi, 'may'],
  [/\bjun(?:i)?\b/gi, 'june'],
  [/\bjul(?:i)?\b/gi, 'july'],
  [/\baug(?:ust)?\b/gi, 'august'],
  [/\bsep(?:tember)?\b/gi, 'september'],
  [/\bokt(?:ober)?\b/gi, 'october'],
  [/\bnov(?:ember)?\b/gi, 'november'],
  [/\bdes(?:ember)?\b/gi, 'december'],
];

function normalizeNorwegian(text) {
  let t = text;
  for (const [re, en] of NO_TO_EN_EVENT) t = t.replace(re, en);
  return t;
}

/**
 * Parse a natural language event description into structured fields.
 * @param {string} text
 * @param {Date} [refDate]
 * @param {string} [timezone] - IANA timezone name, e.g. 'Europe/Oslo'
 * @returns {{ parsed, title, start, end, allDay, parsedText, rrule }}
 */
function parse(text, refDate = new Date(), timezone = 'UTC') {
  const trimmed = text.trim();
  if (!trimmed) return { parsed: false };

  const rruleResult = detectRrule(trimmed);
  const rrule = rruleResult?.rule || null;

  // Normalize: translate Norwegian, expand short time ranges, strip rrule phrase
  let normalized = normalizeTimeRanges(normalizeNorwegian(trimmed));
  // Remove rrule phrase before chrono-parsing so it doesn't bleed into the title
  if (rruleResult?.matchText) {
    normalized = normalized.replace(new RegExp(escapeRegex(rruleResult.matchText), 'i'), '').replace(/\s{2,}/g, ' ').trim();
  }

  const results = chrono.parse(normalized, refDate, { forwardDate: true, timezone });

  if (!results.length) {
    const baseTitle = normalized.trim() || trimmed;
    return { parsed: !!rrule, title: baseTitle, rrule };
  }

  const result = results[0];
  const start = result.start.date();
  const hasTime = result.start.isCertain('hour');
  const end = result.end
    ? result.end.date()
    : new Date(start.getTime() + (hasTime ? 3600000 : 86400000));

  const before = normalized.slice(0, result.index).trim();
  const after  = normalized.slice(result.index + result.text.length).trim();
  const title  = [before, after].filter(Boolean).join(' ').trim() || normalized.trim() || trimmed;

  return {
    parsed: true,
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: !hasTime,
    parsedText: result.text,
    rrule,
  };
}

/**
 * Detect rrule and return the matched text so it can be stripped from the title.
 */
function detectRrule(text) {
  for (const [re, rule] of RECURRENCE) {
    const m = text.match(re);
    if (m) return { rule, matchText: m[0] };
  }
  return null;
}

function stripRruleFromTitle(title, rruleResult) {
  if (!rruleResult?.matchText) return title;
  return title.replace(new RegExp(escapeRegex(rruleResult.matchText), 'i'), '').replace(/\s{2,}/g, ' ').trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { parse };
