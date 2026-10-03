// An event's reminder. Nodecal models one alarm as minutes before the start;
// other clients write several VALARMs (email, audio, a second display alarm)
// and those stay as they were. Only the alarm Nodecal read its minutes from
// is replaced when the reminder changes.

/**
 * The components nested in a VEVENT, each as its lines.
 * @param {string[]} nested
 * @returns {string[][]}
 */
function nestedBlocks(nested) {
  /** @type {string[][]} */
  const blocks = [];
  /** @type {string[]} */
  let block = [];
  let depth = 0;
  for (const line of nested) {
    const upper = line.toUpperCase();
    if (upper.startsWith('BEGIN:')) depth++;
    block.push(line);
    if (upper.startsWith('END:')) depth--;
    if (depth === 0) {
      blocks.push(block);
      block = [];
    }
  }
  return blocks;
}

/**
 * Minutes before the start a VALARM fires at, or null when its trigger is not
 * a "before the start" duration Nodecal can show.
 * @param {string[]} block
 * @returns {number|null}
 */
function triggerMinutes(block) {
  if (block[0]?.toUpperCase() !== 'BEGIN:VALARM') return null;
  for (const line of block) {
    if (!/^TRIGGER[;:]/i.test(line)) continue;
    const m = line.slice(line.indexOf(':') + 1).match(/-P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/i);
    if (m) return parseInt(m[1] || '0') * 1440 + parseInt(m[2] || '0') * 60 + parseInt(m[3] || '0');
  }
  return null;
}

/**
 * The index of the alarm Nodecal shows: the first one it can read.
 * @param {string[][]} blocks
 */
function shownAlarm(blocks) {
  for (let i = 0; i < blocks.length; i++) {
    if (triggerMinutes(blocks[i]) !== null) return i;
  }
  return -1;
}

/**
 * @param {string[]} nested - the VEVENT's nested component lines
 * @returns {number|null}
 */
function alarmMinutes(nested) {
  const blocks = nestedBlocks(nested);
  const index = shownAlarm(blocks);
  if (index === -1) return null;
  return triggerMinutes(blocks[index]);
}

/**
 * The nested components for an event being written back.
 * @param {string[]} nested - as they arrived
 * @param {number|null} before - the minutes they parse to
 * @param {number|null|undefined} after - the minutes the event has now
 * @returns {string[]}
 */
function alarmLines(nested, before, after) {
  if (String(before ?? '') === String(after ?? '')) return nested;
  const blocks = nestedBlocks(nested);
  const replaced = shownAlarm(blocks);
  const lines = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i !== replaced) lines.push(...blocks[i]);
  }
  if (after > 0) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      `TRIGGER:${trigger(after)}`,
      'END:VALARM',
    );
  }
  return lines;
}

/** @param {number} minutes */
function trigger(minutes) {
  if (minutes >= 1440 && minutes % 1440 === 0) return `-P${minutes / 1440}D`;
  if (minutes >= 60 && minutes % 60 === 0) return `-PT${minutes / 60}H`;
  return `-PT${minutes}M`;
}

module.exports = { alarmMinutes, alarmLines };
