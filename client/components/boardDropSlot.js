// Where in a cell a dragged card would land on a board in manual order, and the
// gap that shows it. Positions count the cell's cards without the dragged one,
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
 * Open the gap where the drop goes: before the card it lands above, or after
 * the last card. Cells hold only cards, so the end of the cell is after it.
 * The gap moves the cards below it, which `slotIndex` then measures; that is
 * stable, because a card only swaps sides once the pointer passes its middle
 * as drawn, gap included.
 * @param {HTMLElement} cell
 * @param {string} draggedId
 * @param {number} index
 * @param {HTMLElement} gap
 */
export function openGap(cell, draggedId, index, gap) {
  const cards = otherCards(cell, draggedId);
  if (index < cards.length) cards[index].before(gap);
  else cell.appendChild(gap);
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
