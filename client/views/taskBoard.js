import { state } from '../app/state.js';
import { todayStr } from '../app/dayWindow.js';
import { buildBoard, DONE_WINDOW_DAYS } from '../app/boardModel.js';
import { dropChanges } from '../app/boardMoves.js';
import { bucketDraft, moveGroups } from '../app/boardActions.js';
import { placedMove } from '../app/boardOrder.js';
import { buildTaskCard } from '../components/taskCard.js';
import { buildColumnHead, buildLaneHead } from '../components/boardHeads.js';
import { showBoardMoveMenu } from '../components/boardMoveMenu.js';
import { initBoardDnd } from '../components/boardDnd.js';

/**
 * @typedef {import('../app/state.js').Task} Task
 * @typedef {import('../app/boardBuckets.js').TaskBoard} TaskBoard
 * @typedef {import('../app/boardBuckets.js').BoardContext} BoardContext
 * @typedef {import('../app/boardModel.js').BoardLayout} BoardLayout
 */

// Every drop, star or completion rebuilds the board. These keep the reader's
// place across that: where each board was scrolled to, which lanes are folded,
// and which card a menu move should hand keyboard focus back to.
/** @type {Map<string, {left: number, top: number}>} */
const scrollByBoard = new Map();
/** @type {Set<string>} */
const foldedLanes = new Set();
let refocusTaskId = '';

/** @returns {BoardContext} */
function boardContext() {
  return {
    today: todayStr(state.config.timezone),
    hiddenCategories: state.config.hiddenCategories || [],
    sources: (state.taskSources || []).filter((s) => !state.hiddenCalendars.has(s.url)),
  };
}

/**
 * Render tasks as a kanban board: a header row of columns, then one row of
 * cells per swim lane (a single unlabelled row when the board has no lanes).
 * @param {HTMLElement} container
 * @param {Task[]} tasks - already filtered and sorted by the tasks view
 * @param {TaskBoard} board
 * @param {Record<string, Function|null>} callbacks - onComplete, onStar, onEdit,
 *   onBoardMove(task, changes, shifts), onBoardAdd
 * @param {boolean} ordered - tasks are in manual order, so a card's place in its
 *   cell can be changed and is kept
 */
export function renderTaskBoard(container, tasks, board, callbacks, ordered) {
  const ctx = boardContext();
  const layout = buildBoard(tasks, board, ctx);

  const el = document.createElement('div');
  el.className = 'task-board' + (board.lanes ? '' : ' task-board-unlaned');
  el.style.setProperty('--board-columns', String(layout.columns.length));

  /** @param {Task} task */
  function openMoveMenu(task) {
    const groups = moveGroups(board, layout, task, ctx, ordered);
    showBoardMoveMenu(task, groups, async function moveTo(target) {
      refocusTaskId = task.id;
      try {
        await callbacks.onBoardMove(task, target.changes, target.shifts || []);
      } finally {
        // The last re-render restores focus on its next frame; clear after that.
        requestAnimationFrame(function stopRefocusing() {
          refocusTaskId = '';
        });
      }
    });
  }

  for (const column of layout.columns) {
    let hint = '';
    if (column.key === 'done' && board.columns === 'status') {
      hint = `Completed in the last ${DONE_WINDOW_DAYS} days`;
    }
    const onAdd = addHandler(board.columns, column.key, ctx, callbacks);
    el.appendChild(buildColumnHead(column.label, columnCount(layout, column.key), { hint, onAdd }));
  }
  for (const lane of layout.lanes) {
    const foldKey = `${board.id}\n${lane.key}`;
    const folded = foldedLanes.has(foldKey);
    if (board.lanes) {
      el.appendChild(
        buildLaneHead(lane.label, laneCount(layout, lane.key), {
          folded,
          onToggle: function toggleLane() {
            if (folded) foldedLanes.delete(foldKey);
            else foldedLanes.add(foldKey);
            el.remove();
            renderTaskBoard(container, tasks, board, callbacks, ordered);
          },
          onAdd: addHandler(board.lanes, lane.key, ctx, callbacks),
        }),
      );
    }
    if (folded) continue;
    for (const column of layout.columns) {
      const cell = document.createElement('div');
      cell.className = 'task-board-cell';
      cell.dataset.lane = lane.key;
      cell.dataset.column = column.key;
      for (const task of layout.cells.get(lane.key).get(column.key)) {
        let onMove = null;
        if (callbacks.onBoardMove && moveGroups(board, layout, task, ctx, ordered).length) {
          onMove = openMoveMenu;
        }
        cell.appendChild(
          buildTaskCard(task, {
            onComplete: callbacks.onComplete,
            onStar: callbacks.onStar,
            onClick: callbacks.onEdit,
            onMove,
          }),
        );
      }
      el.appendChild(cell);
    }
  }
  container.appendChild(el);
  // The tasks view builds its list before attaching it, and a detached board
  // has no layout to scroll or focus, so wait until it is on the page.
  if (el.isConnected) {
    restorePlace(el, board);
  } else {
    requestAnimationFrame(function restoreOnceAttached() {
      restorePlace(el, board);
    });
  }

  el.addEventListener(
    'scroll',
    function rememberScroll() {
      scrollByBoard.set(board.id, { left: el.scrollLeft, top: el.scrollTop });
    },
    { passive: true },
  );

  if (!callbacks.onBoardMove) return;
  /** @param {string} id */
  function findTask(id) {
    for (const task of tasks) {
      if (task.id === id) return task;
    }
    return null;
  }
  initBoardDnd(el, {
    ordered,
    canDrop(id, cell) {
      const task = findTask(id);
      if (!task) return false;
      return dropChanges(board, task, cell.dataset.lane, cell.dataset.column, ctx) !== null;
    },
    onDrop(id, cell, index) {
      const task = findTask(id);
      if (!task) return;
      let changes = dropChanges(board, task, cell.dataset.lane, cell.dataset.column, ctx);
      if (!changes) return;
      /** @type {import('../app/manualOrder.js').OrderWrite[]} */
      let shifts = [];
      if (ordered) {
        const cellTasks = layout.cells.get(cell.dataset.lane).get(cell.dataset.column);
        ({ changes, shifts } = placedMove(changes, task, cellTasks, index));
      }
      if (Object.keys(changes).length || shifts.length) {
        callbacks.onBoardMove(task, changes, shifts);
      }
    },
  });
}

/**
 * Put the scroll position back and, after a menu move, focus the moved card in
 * its new cell (which scrolls it into view). Focus is only taken back from the
 * page body — where it falls when the old card was removed — never from
 * wherever the user has since moved it.
 * @param {HTMLElement} el
 * @param {TaskBoard} board
 */
function restorePlace(el, board) {
  if (!el.isConnected) return;
  const saved = scrollByBoard.get(board.id);
  if (saved) {
    el.scrollLeft = saved.left;
    el.scrollTop = saved.top;
  }
  if (!refocusTaskId) return;
  const active = document.activeElement;
  if (active && active !== document.body) return;
  for (const card of el.querySelectorAll('.task-card')) {
    const cardEl = /** @type {HTMLElement} */ (card);
    if (cardEl.dataset.id === refocusTaskId) {
      cardEl.focus();
      return;
    }
  }
}

/**
 * The "+" handler for a bucket, or null where a new task has no clear place.
 * @param {import('../app/boardBuckets.js').BoardField} field
 * @param {string} key
 * @param {BoardContext} ctx
 * @param {Record<string, Function|null>} callbacks
 * @returns {(() => void)|null}
 */
function addHandler(field, key, ctx, callbacks) {
  if (!callbacks.onBoardAdd) return null;
  const draft = bucketDraft(field, key, ctx);
  if (!draft) return null;
  return function addToBucket() {
    callbacks.onBoardAdd(draft);
  };
}

/**
 * @param {BoardLayout} layout
 * @param {string} columnKey
 */
function columnCount(layout, columnKey) {
  let count = 0;
  for (const row of layout.cells.values()) count += row.get(columnKey).length;
  return count;
}

/**
 * @param {BoardLayout} layout
 * @param {string} laneKey
 */
function laneCount(layout, laneKey) {
  let count = 0;
  for (const tasks of layout.cells.get(laneKey).values()) count += tasks.length;
  return count;
}
