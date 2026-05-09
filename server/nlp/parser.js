const chrono = require('chrono-node');

/**
 * Convert a chrono ParsedResult date to UTC, interpreting the parsed hour/minute
 * as local time in the given IANA timezone (chrono-node returns times as UTC
 * regardless of the timezone option — we must apply the offset ourselves).
 */
function chronoToUtc(result, timezone) {
  // If chrono captured an explicit timezone in the text, trust its Date
  if (result.start.get('timezone') !== null) return result.start.date();
  const s = result.start;
  const year  = s.get('year');
  const month = String(s.get('month')).padStart(2, '0');
  const day   = String(s.get('day')).padStart(2, '0');
  const hour  = String(s.get('hour')).padStart(2, '0');
  const min   = String(s.get('minute')).padStart(2, '0');
  // Treat the time as floating local in `timezone`, convert to UTC
  const naive = new Date(`${year}-${month}-${day}T${hour}:${min}:00Z`);
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(naive)) parts[p.type] = p.value;
  const h = parts.hour === '24' ? '00' : parts.hour;
  const shownAsUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}Z`);
  return new Date(naive.getTime() + (naive.getTime() - shownAsUtc.getTime()));
}

function chronoEndToUtc(result, timezone, startUtc, hasTime) {
  if (!result.end) return null;
  if (result.end.get('timezone') !== null) return result.end.date();
  const s = result.end;
  const year  = s.get('year');
  const month = String(s.get('month')).padStart(2, '0');
  const day   = String(s.get('day')).padStart(2, '0');
  const hour  = String(s.get('hour')).padStart(2, '0');
  const min   = String(s.get('minute')).padStart(2, '0');
  const naive = new Date(`${year}-${month}-${day}T${hour}:${min}:00Z`);
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(naive)) parts[p.type] = p.value;
  const h = parts.hour === '24' ? '00' : parts.hour;
  const shownAsUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}Z`);
  return new Date(naive.getTime() + (naive.getTime() - shownAsUtc.getTime()));
}

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
  [/hver\s+m[åa]ned\b|m[åa]nedlig\b/i, 'FREQ=MONTHLY'],
  [/hvert\s+[åa]r\b|[åa]rlig\b/i, 'FREQ=YEARLY'],
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
  // "om N dager/uker/måneder/år" → "in N days/weeks/months/years"
  [/\bom\s+(\d+)\s+dag(?:er)?\b/gi, (_, n) => `in ${n} day${n === '1' ? '' : 's'}`],
  [/\bom\s+(\d+)\s+uke(?:r)?\b/gi, (_, n) => `in ${n} week${n === '1' ? '' : 's'}`],
  [/\bom\s+(\d+)\s+m[åa]ned(?:er)?\b/gi, (_, n) => `in ${n} month${n === '1' ? '' : 's'}`],
  [/\bom\s+(\d+)\s+[åa]r\b/gi, (_, n) => `in ${n} year${n === '1' ? '' : 's'}`],
  [/\bi overmorgen\b/gi, 'in 2 days'],
  [/\biovermorgen\b/gi, 'in 2 days'],
  [/\bovermorgen\b/gi, 'in 2 days'],
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
  [/\bforrige\b/gi, 'last'],
  // plural before singular to avoid partial replacement
  [/\buker\b/gi, 'weeks'],
  [/\buke\b/gi, 'week'],
  [/\bm[åa]neder\b/gi, 'months'],
  [/\bm[åa]ned\b/gi, 'month'],
  // å is non-ASCII so \b at start doesn't work; match ar\b covers both ar and år
  [/år\b/gi, 'year'],
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
 * Normalize text and build a map from each normalized character index back
 * to [origStart, origEnd] in the original text. Used to map chrono's match
 * position back to the original (possibly Norwegian) input for highlighting.
 */
function buildNormMap(text) {
  const normSpans = []; // normSpans[j] = [origStart, origEnd]
  let normalized = '';
  let pos = 0;

  while (pos < text.length) {
    let matched = false;
    for (const [re, en] of NO_TO_EN_EVENT) {
      // Enforce word boundary at pos if pattern requires it
      if (re.source.startsWith('\\b') && pos > 0 && /\w/.test(text[pos - 1])) continue;

      const flags = (re.flags || '').replace(/g/g, '');
      const m = new RegExp(re.source, flags).exec(text.slice(pos));
      if (!m || m.index !== 0) continue;

      const origLen = m[0].length;
      // Call like String.replace callback: fn(fullMatch, group1, group2, ...)
      const rep = typeof en === 'function' ? en(m[0], ...m.slice(1)) : en;
      if (typeof rep !== 'string') continue;

      for (let j = 0; j < rep.length; j++) normSpans.push([pos, pos + origLen]);
      normalized += rep;
      pos += origLen;
      matched = true;
      break;
    }
    if (!matched) {
      normSpans.push([pos, pos + 1]);
      normalized += text[pos++];
    }
  }

  return {
    normalized,
    getOrigSpan(normStart, normLen) {
      if (!normLen || !normSpans.length) return '';
      const s = normSpans[normStart];
      const e = normSpans[Math.min(normStart + normLen - 1, normSpans.length - 1)];
      return s && e ? text.slice(s[0], e[1]) : '';
    },
  };
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

  // Strip rrule phrase from original BEFORE normalization — the matchText is Norwegian
  // and won't be found after translation (e.g. "hver uke" → "every week").
  let textForParsing = trimmed;
  if (rruleResult?.matchText) {
    textForParsing = trimmed.replace(new RegExp(escapeRegex(rruleResult.matchText), 'i'), '').replace(/\s{2,}/g, ' ').trim();
  }

  // Build position map while normalizing, so we can map chrono's result back to original text
  const normMap = buildNormMap(textForParsing);
  const normalized = normalizeTimeRanges(normMap.normalized);

  const results = chrono.parse(normalized, refDate, { forwardDate: true, timezone });

  if (!results.length) {
    const baseTitle = normMap.normalized.trim() || trimmed;
    return { parsed: !!rrule, title: baseTitle, rrule };
  }

  const result = results[0];
  const hasTime = result.start.isCertain('hour');
  const start = chronoToUtc(result, timezone);
  const endRaw = chronoEndToUtc(result, timezone, start, hasTime);
  const end = endRaw ?? new Date(start.getTime() + (hasTime ? 3600000 : 86400000));

  const before = normalized.slice(0, result.index).trim();
  const after  = normalized.slice(result.index + result.text.length).trim();
  const title  = [before, after].filter(Boolean).join(' ').trim() || normalized.trim() || trimmed;

  // Map chrono's match position back to the original (possibly Norwegian) input.
  // normalizeTimeRanges runs after buildNormMap and can lengthen the text (e.g. "18-21" →
  // "18:00-21:00"), so we try two strategies:
  // 1. Find the English parsedText verbatim in normMap.normalized (works when no time expansion)
  // 2. Fall back to result.index in normMap.normalized (works when time range was expanded)
  const normParsed = result.text;
  const normIdx = normMap.normalized.toLowerCase().indexOf(normParsed.toLowerCase());
  let parsedText;
  if (normIdx !== -1) {
    parsedText = normMap.getOrigSpan(normIdx, normParsed.length);
  } else if (result.index < normMap.normalized.length) {
    // Use result.index in normMap.normalized; normalizeTimeRanges only lengthens,
    // so normParsed.length >= equivalent span in normMap.normalized — cap safely.
    const spanLen = Math.min(normParsed.length, normMap.normalized.length - result.index);
    parsedText = normMap.getOrigSpan(result.index, spanLen);
  } else {
    parsedText = normParsed; // last resort: English text
  }

  return {
    parsed: true,
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: !hasTime,
    parsedText,
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
