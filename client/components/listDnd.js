// Reorder list items within their visible section. A touch hold leaves normal
// scrolling available until the user means to drag, like the board drag.
const LONG_PRESS_MS = 400;
const TOUCH_SLOP_PX = 8;
const MOUSE_SLOP_PX = 5;
const EDGE_PX = 48;
/** @type {WeakMap<HTMLElement, AbortController>} */
const listeners = new WeakMap();

/** @param {HTMLElement} list */
export function clearListDnd(list) {
  listeners.get(list)?.abort();
  listeners.delete(list);
}

/**
 * @param {HTMLElement} list
 * @param {(id: string, section: HTMLElement, index: number) => void} onDrop
 */
export function initListDnd(list, onDrop) {
  clearListDnd(list);
  const controller = new window.AbortController();
  listeners.set(list, controller);
  let dragging = false;
  let touchPressed = false;
  list.addEventListener(
    'touchmove',
    function holdScrollWhileDragging(event) {
      if (dragging && event.cancelable) event.preventDefault();
    },
    { passive: false, signal: controller.signal },
  );
  list.addEventListener(
    'contextmenu',
    function suppressLongPressMenu(event) {
      if (touchPressed) event.preventDefault();
    },
    { signal: controller.signal },
  );

  list.addEventListener(
    'pointerdown',
    function pressHandle(down) {
      if (down.pointerType === 'mouse' && down.button !== 0) return;
      const pressed = /** @type {HTMLElement} */ (down.target);
      const handle = pressed.closest('.task-list-move');
      const item = /** @type {HTMLElement|null} */ (handle?.closest('li[data-id]') || null);
      const section = /** @type {HTMLElement|null} */ (item?.closest('.task-list-group') || null);
      if (!item || !section) return;

      const isMouse = down.pointerType === 'mouse';
      if (isMouse) down.preventDefault();
      touchPressed = !isMouse;
      const id = item.dataset.id;
      let originIndex = 0;
      let sibling = item.previousElementSibling;
      while (sibling) {
        if (sibling.matches('li[data-id]')) originIndex++;
        sibling = sibling.previousElementSibling;
      }
      const rect = item.getBoundingClientRect();
      const grabX = down.clientX - rect.left;
      const grabY = down.clientY - rect.top;
      let lastX = down.clientX;
      let lastY = down.clientY;
      let targetIndex = originIndex;
      /** @type {HTMLElement|null} */
      let ghost = null;
      /** @type {HTMLElement|null} */
      let gap = null;
      let frame = 0;
      let timer = 0;
      if (!isMouse) timer = window.setTimeout(lift, LONG_PRESS_MS);

      function lift() {
        timer = 0;
        dragging = true;
        item.classList.add('task-list-lifted');
        gap = document.createElement('li');
        gap.className = 'task-list-gap';
        gap.style.height = `${rect.height}px`;
        item.after(gap);
        ghost = /** @type {HTMLElement} */ (item.cloneNode(true));
        ghost.classList.remove('task-list-lifted');
        ghost.classList.add('task-list-ghost');
        ghost.style.width = `${rect.width}px`;
        document.body.appendChild(ghost);
        follow();
        frame = requestAnimationFrame(scrollNearEdge);
      }

      function follow() {
        ghost.style.transform = `translate(${lastX - grabX}px, ${lastY - grabY}px)`;
        const under = document.elementFromPoint(lastX, lastY);
        const hovered = under?.closest('.task-list-group');
        if (hovered !== section) {
          targetIndex = originIndex;
          item.after(gap);
          return;
        }
        targetIndex = slotIndex(section, id, lastY);
        openGap(section, id, targetIndex, gap);
      }

      function scrollNearEdge() {
        const box = list.getBoundingClientRect();
        if (lastX >= box.left && lastX <= box.right && lastY >= box.top && lastY <= box.bottom) {
          if (lastY < box.top + EDGE_PX) list.scrollBy(0, -12);
          else if (lastY > box.bottom - EDGE_PX) list.scrollBy(0, 12);
        }
        follow();
        frame = requestAnimationFrame(scrollNearEdge);
      }

      /** @param {PointerEvent} event */
      function onMove(event) {
        if (event.pointerId !== down.pointerId) return;
        lastX = event.clientX;
        lastY = event.clientY;
        if (dragging) {
          follow();
          return;
        }
        const moved = Math.max(Math.abs(lastX - down.clientX), Math.abs(lastY - down.clientY));
        if (isMouse && moved > MOUSE_SLOP_PX) lift();
        else if (!isMouse && moved > TOUCH_SLOP_PX) finish();
      }

      /** @param {PointerEvent} event */
      function onUp(event) {
        if (event.pointerId !== down.pointerId) return;
        const lifted = dragging;
        const index = targetIndex;
        finish();
        if (!lifted) return;
        handle.addEventListener('click', swallowClick, { capture: true, once: true });
        setTimeout(function dropStaleSwallow() {
          handle.removeEventListener('click', swallowClick, { capture: true });
        }, 0);
        if (index !== originIndex) onDrop(id, section, index);
      }

      /** @param {PointerEvent} event */
      function onCancel(event) {
        if (event.pointerId === down.pointerId) finish();
      }

      function finish() {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        dragging = false;
        touchPressed = false;
        ghost?.remove();
        gap?.remove();
        item.classList.remove('task-list-lifted');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        controller.signal.removeEventListener('abort', finish);
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      controller.signal.addEventListener('abort', finish, { once: true });
    },
    { signal: controller.signal },
  );
}

/** @param {HTMLElement} section @param {string} id @param {number} y */
function slotIndex(section, id, y) {
  let index = 0;
  for (const item of otherItems(section, id)) {
    const box = item.getBoundingClientRect();
    if (y > box.top + box.height / 2) index++;
  }
  return index;
}

/** @param {HTMLElement} section @param {string} id @param {number} index @param {HTMLElement} gap */
function openGap(section, id, index, gap) {
  const items = otherItems(section, id);
  if (index < items.length) items[index].before(gap);
  else section.appendChild(gap);
}

/** @param {HTMLElement} section @param {string} id @returns {HTMLElement[]} */
function otherItems(section, id) {
  const items = [];
  for (const element of section.children) {
    const item = /** @type {HTMLElement} */ (element);
    if (item.matches('li[data-id]') && item.dataset.id !== id) items.push(item);
  }
  return items;
}

/** @param {Event} event */
function swallowClick(event) {
  event.stopImmediatePropagation();
}
