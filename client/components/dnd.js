import { HOUR_HEIGHT, TIME_COL_WIDTH } from './timeGrid.js';

const LONG_PRESS_MS = 400;
const SNAP_MIN = 15;

function snap(minutes) {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN;
}

/**
 * Initialize drag-to-move and resize for event blocks in a time grid.
 * Works for desktop (immediate on movement > 5px) and mobile (400ms long press).
 *
 * @param {HTMLElement} gridEl  - .day-grid or .week-grid
 * @param {HTMLElement} scrollEl - .grid-scroll (parent of gridEl)
 * @param {object} opts
 * @param {function(clientX: number, gridRect: DOMRect): Date} opts.getDayFromX
 * @param {function(id: string, day: Date, startMin: number): void} opts.onMove
 * @param {function(id: string, endMin: number): void} opts.onResize
 */
export function initDnd(gridEl, scrollEl, opts) {
  gridEl.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const isResize = !!e.target.closest('.resize-handle');
    const block = (isResize ? e.target.closest('.resize-handle') : e.target).closest('.event-block');
    if (!block) return;

    e.preventDefault();
    const blockRect = block.getBoundingClientRect();
    const gridRect = gridEl.getBoundingClientRect();
    const grabOffsetY = isResize ? 0 : e.clientY - blockRect.top;

    let active = false;
    let ghost = null;

    const timer = setTimeout(activate, LONG_PRESS_MS);

    function activate() {
      active = true;
      block.style.opacity = '0.3';
      ghost = block.cloneNode(true);
      ghost.style.cssText = `position:fixed;width:${blockRect.width}px;height:${blockRect.height}px;` +
        `left:${blockRect.left}px;top:${isResize ? blockRect.top : e.clientY - grabOffsetY}px;` +
        `opacity:0.8;pointer-events:none;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.35);` +
        `border-radius:6px;`;
      document.body.appendChild(ghost);
    }

    function handleMove(ev) {
      if (!active) {
        if (Math.abs(ev.clientY - e.clientY) > 5 || Math.abs(ev.clientX - e.clientX) > 5) {
          clearTimeout(timer);
          activate();
        }
      }
      if (!ghost) return;
      if (isResize) {
        ghost.style.height = `${Math.max(24, ev.clientY - blockRect.top)}px`;
      } else {
        ghost.style.top = `${ev.clientY - grabOffsetY}px`;
      }
    }

    function handleUp(ev) {
      clearTimeout(timer);
      if (active) {
        const scrollTop = scrollEl.scrollTop;
        if (isResize) {
          const y = ev.clientY - gridRect.top + scrollTop;
          opts.onResize(block.dataset.id, snap(Math.max(SNAP_MIN, (y / HOUR_HEIGHT) * 60)));
        } else {
          const y = ev.clientY - gridRect.top + scrollTop - grabOffsetY;
          const startMin = snap(Math.max(0, Math.min((y / HOUR_HEIGHT) * 60, 23 * 60 + 45)));
          opts.onMove(block.dataset.id, opts.getDayFromX(ev.clientX, gridRect), startMin);
        }
      }
      cleanup();
    }

    function cleanup() {
      block.removeEventListener('pointermove', handleMove);
      block.removeEventListener('pointerup', handleUp);
      block.removeEventListener('pointercancel', cleanup);
      if (ghost) { ghost.remove(); ghost = null; }
      block.style.opacity = '';
    }

    block.setPointerCapture(e.pointerId);
    block.addEventListener('pointermove', handleMove);
    block.addEventListener('pointerup', handleUp);
    block.addEventListener('pointercancel', cleanup);
  });
}

/**
 * Enable drag-to-move for event chips in a month or agenda grid.
 * Chips must have data-id and data-start-min attributes.
 * Day drop targets must have a data-day="YYYY-MM-DD" attribute.
 *
 * @param {HTMLElement} containerEl
 * @param {{ chipSelector: string, daySelector: string, onMove: function }} opts
 */
export function initDayDnd(containerEl, { chipSelector, daySelector, onMove }) {
  containerEl.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const chip = e.target.closest(chipSelector);
    if (!chip) return;

    e.preventDefault();
    const id = chip.dataset.id;
    const startMin = parseInt(chip.dataset.startMin || '0', 10);
    const chipRect = chip.getBoundingClientRect();

    let active = false;
    let ghost = null;
    let targetEl = null;

    const timer = setTimeout(activate, LONG_PRESS_MS);

    function activate() {
      active = true;
      chip.style.opacity = '0.3';
      ghost = chip.cloneNode(true);
      ghost.style.cssText = `position:fixed;width:${chipRect.width}px;height:${chipRect.height}px;` +
        `left:${chipRect.left}px;top:${chipRect.top}px;` +
        `opacity:0.85;pointer-events:none;z-index:200;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
      document.body.appendChild(ghost);
    }

    function handleMove(ev) {
      if (!active) {
        if (Math.abs(ev.clientX - e.clientX) > 5 || Math.abs(ev.clientY - e.clientY) > 5) {
          clearTimeout(timer);
          activate();
        }
      }
      if (!ghost) return;
      ghost.style.left = `${ev.clientX - chipRect.width / 2}px`;
      ghost.style.top = `${ev.clientY - chipRect.height / 2}px`;

      if (targetEl) targetEl.classList.remove('dnd-over');
      targetEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(daySelector);
      if (targetEl) targetEl.classList.add('dnd-over');
    }

    function handleUp(ev) {
      clearTimeout(timer);
      if (active) {
        // Suppress the click event that fires immediately after pointerup
        chip.addEventListener('click', e => e.stopImmediatePropagation(), { capture: true, once: true });
        if (targetEl?.dataset.day) {
          const day = new Date(targetEl.dataset.day + 'T00:00:00');
          onMove(id, day, startMin);
        }
      }
      cleanup();
    }

    function cleanup() {
      chip.removeEventListener('pointermove', handleMove);
      chip.removeEventListener('pointerup', handleUp);
      chip.removeEventListener('pointercancel', cleanup);
      if (ghost) { ghost.remove(); ghost = null; }
      if (targetEl) { targetEl.classList.remove('dnd-over'); targetEl = null; }
      chip.style.opacity = '';
    }

    chip.setPointerCapture(e.pointerId);
    chip.addEventListener('pointermove', handleMove);
    chip.addEventListener('pointerup', handleUp);
    chip.addEventListener('pointercancel', cleanup);
  });
}

/**
 * Detect horizontal swipe on a scroll container.
 * Only triggers if horizontal motion dominates and vertical scroll didn't happen.
 */
export function initSwipe(el, onPrev, onNext) {
  let startX, startY, startScrollTop;
  el.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startScrollTop = el.scrollTop;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = Math.abs(e.changedTouches[0].clientY - startY);
    const scrolled = Math.abs(el.scrollTop - startScrollTop);
    if (Math.abs(dx) > 60 && dy < 40 && scrolled < 10) {
      if (dx < 0) onNext(); else onPrev();
    }
  }, { passive: true });
}
