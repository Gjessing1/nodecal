const chrono = require('chrono-node');

// Norwegian → English substitutions applied before parsing
const NO_TO_EN = [
  // "om N dager/uker/måneder" → "in N days/weeks/months" (must come before singular forms)
  [/\bom\s+(\d+)\s+dag(?:er)?\b/gi, (_, n) => `in ${n} day${n==='1'?'':'s'}`],
  [/\bom\s+(\d+)\s+uke(?:r)?\b/gi,  (_, n) => `in ${n} week${n==='1'?'':'s'}`],
  [/\bom\s+(\d+)\s+m[åa]ned(?:er)?\b/gi, (_, n) => `in ${n} month${n==='1'?'':'s'}`],
  [/\bi overmorgen\b/gi,        'in 2 days'],
  [/\biovermorgen\b/gi,         'in 2 days'],
  [/\bovermorgen\b/gi,          'in 2 days'],
  [/\bi morgen\b/gi,          'tomorrow'],
  [/\bimorgen\b/gi,           'tomorrow'],
  [/\bi dag\b/gi,             'today'],
  [/\bidag\b/gi,              'today'],
  [/\bmandag\b/gi,            'monday'],
  [/\btirsdag\b/gi,           'tuesday'],
  [/\bonsdag\b/gi,            'wednesday'],
  [/\btorsdag\b/gi,           'thursday'],
  [/\bfredag\b/gi,            'friday'],
  [/\bl[øo]rdag\b/gi,         'saturday'],
  [/\bs[øo]ndag\b/gi,         'sunday'],
  [/\bneste\b/gi,             'next'],
  [/\bforrige\b/gi,           'last'],
  // plural before singular to avoid partial replacement
  [/\buker\b/gi,              'weeks'],
  [/\buke\b/gi,               'week'],
  [/\bm[åa]neder\b/gi,        'months'],
  [/\bm[åa]ned\b/gi,          'month'],
  [/år\b/gi,                  'year'],
  [/\bjan(?:uar)?\b/gi,       'january'],
  [/\bfeb(?:ruar)?\b/gi,      'february'],
  [/\bmars\b/gi,              'march'],
  [/\bapr(?:il)?\b/gi,        'april'],
  [/\bmai\b/gi,               'may'],
  [/\bjun(?:i)?\b/gi,         'june'],
  [/\bjul(?:i)?\b/gi,         'july'],
  [/\baug(?:ust)?\b/gi,       'august'],
  [/\bsep(?:tember)?\b/gi,    'september'],
  [/\bokt(?:ober)?\b/gi,      'october'],
  [/\bnov(?:ember)?\b/gi,     'november'],
  [/\bdes(?:ember)?\b/gi,     'december'],
  [/\bhver\b/gi,              'every'],
  [/\bdager\b/gi,             'days'],
  // "etter fullføring" → "after completion"
  [/etter\s+fullf[øo]ring/gi, 'after completion'],
  [/etter\s+gjennomf[øo]ring/gi, 'after completion'],
  // "dag" must come after "dager" to avoid partial replace
  [/\bdag\b/gi,               'day'],
];

// After-completion patterns (English, after Norwegian translation)
const AFTER_COMPLETION_RE = [
  // "every N days/weeks after completion" or "after completion every N days/weeks"
  /(?:after\s+completion\s+every|every)\s+(\d+)\s+(day|days|week|weeks)\s*(?:after\s+completion)?/i,
  // "after completion every day/week"
  /after\s+completion\s+every\s+(day|week)/i,
];

// Standard task recurrence (RRULE)
const RRULE_TASK = [
  [/every\s+(\d+)\s+days?\b/i,   n => `FREQ=DAILY;INTERVAL=${n}`],
  [/every\s+(\d+)\s+weeks?\b/i,  n => `FREQ=WEEKLY;INTERVAL=${n}`],
  [/every\s+(\d+)\s+months?\b/i, n => `FREQ=MONTHLY;INTERVAL=${n}`],
  [/every\s+day\b|daily\b/i,     () => 'FREQ=DAILY'],
  [/every\s+week\b|weekly\b/i,   () => 'FREQ=WEEKLY'],
  [/every\s+month\b|monthly\b/i, () => 'FREQ=MONTHLY'],
  [/every\s+monday/i,    () => 'FREQ=WEEKLY;BYDAY=MO'],
  [/every\s+tuesday/i,   () => 'FREQ=WEEKLY;BYDAY=TU'],
  [/every\s+wednesday/i, () => 'FREQ=WEEKLY;BYDAY=WE'],
  [/every\s+thursday/i,  () => 'FREQ=WEEKLY;BYDAY=TH'],
  [/every\s+friday/i,    () => 'FREQ=WEEKLY;BYDAY=FR'],
  [/every\s+saturday/i,  () => 'FREQ=WEEKLY;BYDAY=SA'],
  [/every\s+sunday/i,    () => 'FREQ=WEEKLY;BYDAY=SU'],
];

function translateNorwegian(text) {
  let t = text;
  for (const [re, en] of NO_TO_EN) t = t.replace(re, typeof en === 'function' ? (m, ...args) => en(m, ...args) : en);
  return t;
}

// "18. june" → "18 june" (Norwegian ordinal notation with period)
function normalizeOrdinalDate(text) {
  return text.replace(
    /\b(\d{1,2})\.\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi,
    '$1 $2'
  );
}

// Move a time token before a date word to after it: "14:00 june" → "june at 14:00"
const _MONTH_WORDS = 'january|february|march|april|may|june|july|august|september|october|november|december';
const _DAY_WORDS   = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today';
const _DATE_WORD_RE = new RegExp(`\\b(${_MONTH_WORDS}|${_DAY_WORDS}|next|last)\\b`, 'i');
function normalizeTimeBeforeDate(text) {
  const firstTimeIdx = text.search(/\b\d{1,2}:\d{2}\b/);
  if (firstTimeIdx > 0 && _DATE_WORD_RE.test(text.slice(0, firstTimeIdx))) return text;
  let t = text.replace(
    new RegExp(`\\b(\\d{1,2}:\\d{2})\\s+(\\d{1,2})\\s+(${_MONTH_WORDS})\\b`, 'gi'),
    (_, time, day, month) => `${day} ${month} at ${time}`
  );
  t = t.replace(
    new RegExp(`\\b(\\d{1,2}:\\d{2})\\s+((?:next|last)\\s+)?(${_MONTH_WORDS}|${_DAY_WORDS})\\b`, 'gi'),
    (_, time, mod, dateWord) => `${mod || ''}${dateWord} at ${time}`
  );
  return t;
}

function detectAfterCompletion(text) {
  // "after completion every N days/weeks"
  const m1 = text.match(/after\s+completion\s+every\s+(\d+)\s+(days?|weeks?)/i);
  if (m1) {
    const unit = /week/i.test(m1[2]) ? 'w' : 'd';
    return { xRecurringType: 'after-completion', xRecurringInterval: `${m1[1]}${unit}`, matchText: m1[0] };
  }
  // "every N days/weeks after completion"
  const m2 = text.match(/every\s+(\d+)\s+(days?|weeks?)\s+after\s+completion/i);
  if (m2) {
    const unit = /week/i.test(m2[2]) ? 'w' : 'd';
    return { xRecurringType: 'after-completion', xRecurringInterval: `${m2[1]}${unit}`, matchText: m2[0] };
  }
  // "after completion every day/week" (no number)
  const m3 = text.match(/after\s+completion\s+every\s+(day|week)/i);
  if (m3) {
    return { xRecurringType: 'after-completion', xRecurringInterval: /week/i.test(m3[1]) ? 'weekly' : 'daily', matchText: m3[0] };
  }
  // "every day/week after completion" (no number)
  const m4 = text.match(/every\s+(day|week)\s+after\s+completion/i);
  if (m4) {
    return { xRecurringType: 'after-completion', xRecurringInterval: /week/i.test(m4[1]) ? 'weekly' : 'daily', matchText: m4[0] };
  }
  return null;
}

function detectRrule(text) {
  for (const [re, builder] of RRULE_TASK) {
    const m = text.match(re);
    if (m) return { rrule: builder(m[1]), matchText: m[0] };
  }
  return null;
}

/**
 * Parse a natural language task description.
 * Supports English and Norwegian.
 * Returns: { parsed, title, due, rrule, xRecurringType, xRecurringInterval }
 */
function parseTask(text, refDate = new Date(), timezone = 'UTC') {
  const trimmed = text.trim();
  if (!trimmed) return { parsed: false };

  let translated = translateNorwegian(trimmed);
  translated = normalizeOrdinalDate(translated);
  translated = normalizeTimeBeforeDate(translated);

  // 1. Detect after-completion recurrence first (it has "every ... after completion")
  let recurrenceMatch = null;
  const afterComp = detectAfterCompletion(translated);
  if (afterComp) {
    recurrenceMatch = {
      xRecurringType: afterComp.xRecurringType,
      xRecurringInterval: afterComp.xRecurringInterval,
      rrule: null,
    };
    // Remove the matched recurrence phrase from the text for further parsing
    translated.replace(afterComp.matchText, '');
  } else {
    const rruleMatch = detectRrule(translated);
    if (rruleMatch) {
      recurrenceMatch = { rrule: rruleMatch.rrule, xRecurringType: null, xRecurringInterval: null };
    }
  }

  // 2. Remove recurrence phrase to isolate the date/title part (work on translated text for parsing)
  let forParsing = translated;
  let recurrenceMatchText = null;
  if (afterComp) {
    recurrenceMatchText = afterComp.matchText;
    forParsing = translated.replace(new RegExp(escapeRegex(afterComp.matchText), 'i'), '').trim();
  } else if (recurrenceMatch?.rrule) {
    for (const [re] of RRULE_TASK) {
      const m = forParsing.match(re);
      if (m) { recurrenceMatchText = m[0]; forParsing = forParsing.replace(m[0], '').trim(); break; }
    }
  }

  // 3. Parse due date from the remaining translated text
  const results = chrono.parse(forParsing, refDate, { forwardDate: true, timezone });
  let due = null;
  let titleParts;

  if (results.length > 0) {
    const result = results[0];
    due = result.start.date().toISOString().slice(0, 10);
    const before = forParsing.slice(0, result.index).trim();
    const after  = forParsing.slice(result.index + result.text.length).trim();
    titleParts = [before, after].filter(Boolean).join(' ').trim();
  } else {
    titleParts = forParsing.trim();
  }

  // Reconstruct the title from the *original* trimmed text by removing the same spans
  // This preserves the original Norwegian spelling in the title
  let originalForTitle = trimmed;
  if (recurrenceMatchText) {
    // Try to remove the recurrence phrase from the original (won't match if it was Norwegian,
    // so fall back to the translated title in that case)
    const origMinusRec = trimmed.replace(new RegExp(escapeRegex(recurrenceMatchText), 'i'), '').trim();
    if (origMinusRec !== trimmed) originalForTitle = origMinusRec;
    else originalForTitle = titleParts; // use the translated version
  }
  // Remove any date phrases from the original
  const titleCandidate = results.length > 0 ? titleParts : originalForTitle;
  const title = stripTitleArtifacts(titleCandidate) || trimmed;

  const parsed = !!(due || recurrenceMatch);
  return {
    parsed,
    title,
    due,
    rrule: recurrenceMatch?.rrule || null,
    xRecurringType: recurrenceMatch?.xRecurringType || null,
    xRecurringInterval: recurrenceMatch?.xRecurringInterval || null,
  };
}

function stripTitleArtifacts(t) {
  return t.replace(/\s{2,}/g, ' ').trim();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { parseTask };
