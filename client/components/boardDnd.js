import { cardsAbove, markSlot, slotIndex } from './boardDropSlot.js';

// Matches dnd.js: the same hold lifts an event in the calendar grids.
const LONG_PRESS_MS = 400;
const TOUCH_SLOP_PX = 8;
const MOUSE_SLOP_PX = 5;
const EDGE_PX = 48;
const EDGE_STEP_PX = 12;

/**
 * Drag task cards between the cells of a kanban board.
 *
 * The board scrolls both ways under a finger, so touch needs a long press
 * before a card lifts; a finger that moves sooner is scrolling and is left to
 * the browser. Once lifted, a non-passive touchmove listener cancels the pan
 * the browser would start — touch-action cannot change mid-gesture, and making
 * cards `touch-action: none` would leave nowhere on a full board to scroll.
 * A mouse lifts as soon as it moves.
 *
 * Move/up are listened for on window rather than with pointer capture: a sync
 * can re-render the board mid-drag, and a detached card would take the capture
 * (and the ghost's cleanup) with it.
 *
 * On an ordered board the drop also has a place: the gap between the two cards
 * nearest the pointer, marked with a line, and a card can be dropped back into
 * its own cell at a new place.
 *
 * @param {HTMLElement} boardEl - the scrolling board; cells are `.task-board-cell`
 * @param {object} opts
 * @param {boolean} [opts.ordered]
 * @param {(id: string, cell: HTMLElement) => boolean} opts.canDrop
 * @param {(id: string, cell: HTMLElement, index: number) => void} opts.onDrop - `index`
 *   counts the cell's other cards above the drop; -1 when the board is not ordered
 */
export function initBoardDnd(boardEl, { ordered = false, canDrop, onDrop }) {
  let dragging = false;
  let touchPressed = false;

  boardEl.addEventListener(
    'touchmove',
    function holdScrollWhileDragging(e) {
      if (dragging && e.cancelable) e.preventDefault();
    },
    { passive: false },
  );
  // Android opens a context menu on the same long press that lifts a card.
  boardEl.addEventListener('contextmenu', function suppressLongPressMenu(e) {
    if (touchPressed) e.preventDefault();
  });

  boardEl.addEventListener('pointerdown', function pressCard(down) {
    if (down.pointerType === 'mouse' && down.button !== 0) return;
    const pressed = /** @type {HTMLElement} */ (down.target);
    if (pressed.closest('button, a, input')) return;
    const card = /** @type {HTMLElement|null} */ (pressed.closest('.task-card'));
    if (!card) return;

    const isMouse = down.pointerType === 'mouse';
    // A mouse press would start a text selection; a touch press must keep its
    // default or the board could not be scrolled from a card.
    if (isMouse) down.preventDefault();
    touchPressed = !isMouse;

    const id = card.dataset.id;
    const originCell = card.closest('.task-board-cell');
    const originIndex = cardsAbove(card);
    const rect = card.getBoundingClientRect();
    const grabX = down.clientX - rect.left;
    const grabY = down.clientY - rect.top;
    let lastX = down.clientX;
    let lastY = down.clientY;
    /** @type {HTMLElement|null} */
    let ghost = null;
    /** @type {HTMLElement|null} */
    let hovered = null;
    let hoveredIndex = -1;
    /** @type {HTMLElement|null} */
    let marked = null;
    let frame = 0;
    let timer = 0;
    if (!isMouse) timer = window.setTimeout(lift, LONG_PRESS_MS);

    function lift() {
      timer = 0;
      dragging = true;
      card.classList.add('is-dragging');
      ghost = /** @type {HTMLElement} */ (card.cloneNode(true));
      ghost.classList.remove('is-dragging');
      ghost.classList.add('task-card-ghost');
      ghost.style.width = `${rect.width}px`;
      document.body.appendChild(ghost);
      follow();
      frame = requestAnimationFrame(scrollNearEdges);
    }

    function follow() {
      ghost.style.transform = `translate(${lastX - grabX}px, ${lastY - grabY}px)`;
      const under = document.elementFromPoint(lastX, lastY);
      let cell = /** @type {HTMLElement|null} */ (under?.closest('.task-board-cell') || null);
      if (cell && !boardEl.contains(cell)) cell = null;
      let index = -1;
      if (cell && ordered) index = slotIndex(cell, id, lastY);
      if (cell === hovered && index === hoveredIndex) return;
      clearHover();
      hovered = cell;
      hoveredIndex = index;
      if (!isDrop(cell, index)) return;
      if (!canDrop(id, cell)) {
        cell.classList.add('is-drop-blocked');
        return;
      }
      // Reordering within its own cell only needs the line.
      if (cell !== originCell) cell.classList.add('is-drop-target');
      if (ordered) marked = markSlot(cell, id, index);
    }

    /**
     * A drop somewhere other than where the card already is.
     * @param {HTMLElement|null} cell
     * @param {number} index
     * @returns {cell is HTMLElement}
     */
    function isDrop(cell, index) {
      if (!cell) return false;
      if (cell !== originCell) return true;
      return ordered && index !== originIndex;
    }

    function clearHover() {
      if (marked) marked.classList.remove('is-drop-before', 'is-drop-after');
      marked = null;
      if (!hovered) return;
      hovered.classList.remove('is-drop-target', 'is-drop-blocked');
      hovered = null;
      hoveredIndex = -1;
    }

    function scrollNearEdges() {
      const box = boardEl.getBoundingClientRect();
      let dx = 0;
      let dy = 0;
      if (lastX < box.left + EDGE_PX) dx = -EDGE_STEP_PX;
      else if (lastX > box.right - EDGE_PX) dx = EDGE_STEP_PX;
      if (lastY < box.top + EDGE_PX) dy = -EDGE_STEP_PX;
      else if (lastY > box.bottom - EDGE_PX) dy = EDGE_STEP_PX;
      if (dx || dy) {
        boardEl.scrollBy(dx, dy);
        follow();
      }
      frame = requestAnimationFrame(scrollNearEdges);
    }

    /** @param {PointerEvent} ev */
    function onMove(ev) {
      if (ev.pointerId !== down.pointerId) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (dragging) {
        follow();
        return;
      }
      const moved = Math.max(Math.abs(lastX - down.clientX), Math.abs(lastY - down.clientY));
      if (isMouse && moved > MOUSE_SLOP_PX) lift();
      else if (!isMouse && moved > TOUCH_SLOP_PX) finish();
    }

    /** @param {PointerEvent} ev */
    function onUp(ev) {
      if (ev.pointerId !== down.pointerId) return;
      const lifted = dragging;
      const target = hovered;
      const index = hoveredIndex;
      finish();
      if (!lifted) return;
      // The click that trails pointerup would open the editor on the card.
      card.addEventListener('click', swallowClick, { capture: true, once: true });
      setTimeout(function dropStaleSwallow() {
        card.removeEventListener('click', swallowClick, { capture: true });
      }, 0);
      if (isDrop(target, index) && canDrop(id, target)) onDrop(id, target, index);
    }

    /** @param {PointerEvent} ev */
    function onCancel(ev) {
      if (ev.pointerId === down.pointerId) finish();
    }

    function finish() {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      dragging = false;
      touchPressed = false;
      clearHover();
      if (ghost) ghost.remove();
      ghost = null;
      card.classList.remove('is-dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  });
}

/** @param {Event} e */
function swallowClick(e) {
  e.stopImmediatePropagation();
}
