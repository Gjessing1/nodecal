// An occurrence that was edited out of its series carries a RECURRENCE-ID: it
// is the one Tuesday that moved, the one standup that got a different room.
// Nothing on screen said so, so a series read as inconsistent with itself and
// an edit made in another client looked like a mistake.
//
// Two treatments, because the surfaces are not alike. A chip or a block is a
// few pixels tall and already full of title, so it gets a corner fold drawn in
// its own colour — no width, no words. A list row has space for the word.

const LABEL = 'Edited — this occurrence differs from the rest of its series';

/**
 * True when this event is an occurrence edited out of its series.
 * @param {any} ev
 * @returns {boolean}
 */
export function isModifiedOccurrence(ev) {
  return !!ev.recurrenceId;
}

/**
 * Fold the top-right corner of a chip, block or bar, and say why on hover.
 * @param {HTMLElement} el
 * @param {any} ev
 * @returns {HTMLElement} el, for chaining
 */
export function markModifiedBlock(el, ev) {
  if (!isModifiedOccurrence(ev)) return el;
  el.classList.add('occurrence-modified');
  el.title = el.title ? `${el.title} · ${LABEL}` : LABEL;
  return el;
}

/**
 * The little "edited" tag for a list row, or null when there is nothing to say.
 * @param {any} ev
 * @returns {HTMLElement|null}
 */
export function modifiedTag(ev) {
  if (!isModifiedOccurrence(ev)) return null;
  const tag = document.createElement('span');
  tag.className = 'occurrence-modified-tag';
  tag.textContent = 'edited';
  tag.title = LABEL;
  return tag;
}
