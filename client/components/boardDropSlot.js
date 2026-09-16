// Where in a cell a dragged card would land on a board in manual order, and the
// line that shows it. Positions count the cell's cards without the dragged one,
// matching boardOrder.placedMove.

/**
 * @param {HTMLElement} card
 * @returns {number} cards before it in its cell
 */
export function cardsAbove(card) {
  let count = 0;
  let sibling = card.previousElementSibling;
  while (sibling) {
    if (sibling.classList.contains('task-card')) count++;
    sibling = sibling.previousElementSibling;
  }
  return count;
}

/**
 * How many of the cell's cards, the dragged one aside, sit above `y`: a card
 * counts once the pointer is past its middle.
 * @param {HTMLElement} cell
 * @param {string} draggedId
 * @param {number} y
 */
export function slotIndex(cell, draggedId, y) {
  let index = 0;
  for (const other of otherCards(cell, draggedId)) {
    const box = other.getBoundingClientRect();
    if (y > box.top + box.height / 2) index++;
  }
  return index;
}

/**
 * Draw the drop line: on top of the card the drop goes before, or under the
 * last card. Nothing in an empty cell, where the cell's own highlight says it.
 * @param {HTMLElement} cell
 * @param {string} draggedId
 * @param {number} index
 * @returns {HTMLElement|null} the card carrying the line
 */
export function markSlot(cell, draggedId, index) {
  const cards = otherCards(cell, draggedId);
  if (index < cards.length) {
    cards[index].classList.add('is-drop-before');
    return cards[index];
  }
  const lastCard = cards[cards.length - 1];
  if (!lastCard) return null;
  lastCard.classList.add('is-drop-after');
  return lastCard;
}

/**
 * By task id, not element: a sync can redraw the board mid-drag, leaving a new
 * card for the dragged task in the cell.
 * @param {HTMLElement} cell
 * @param {string} draggedId
 * @returns {HTMLElement[]}
 */
function otherCards(cell, draggedId) {
  const cards = [];
  for (const el of cell.querySelectorAll('.task-card')) {
    const card = /** @type {HTMLElement} */ (el);
    if (card.dataset.id !== draggedId) cards.push(card);
  }
  return cards;
}
