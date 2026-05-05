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
];

/**
 * Parse a natural language event description into structured fields.
 * @param {string} text
 * @param {Date} [refDate]
 * @returns {{ parsed, title, start, end, allDay, parsedText, rrule }}
 */
function parse(text, refDate = new Date()) {
  const trimmed = text.trim();
  if (!trimmed) return { parsed: false };

  const rrule = detectRrule(trimmed);
  const results = chrono.parse(trimmed, refDate, { forwardDate: true });

  if (!results.length) {
    return { parsed: false, title: trimmed, rrule };
  }

  const result = results[0];
  const start = result.start.date();
  const hasTime = result.start.isCertain('hour');
  const end = result.end
    ? result.end.date()
    : new Date(start.getTime() + (hasTime ? 3600000 : 86400000));

  // Strip the date phrase from the text to recover the event title
  const before = trimmed.slice(0, result.index).trim();
  const after  = trimmed.slice(result.index + result.text.length).trim();
  const title  = [before, after].filter(Boolean).join(' ').trim() || trimmed;

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

function detectRrule(text) {
  for (const [re, rule] of RECURRENCE) {
    if (re.test(text)) return rule;
  }
  return null;
}

module.exports = { parse };
