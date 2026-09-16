import { state } from '../app/state.js';
import { todayStr } from '../app/dayWindow.js';
import { buildBoard, DONE_WINDOW_DAYS } from '../app/boardModel.js';
import { dropChanges } from '../app/boardMoves.js';
import { buildTaskCard } from '../components/taskCard.js';
import { initBoardDnd } from '../components/boardDnd.js';

/**
 * @typedef {import('../app/state.js').Task} Task
 * @typedef {import('../app/boardBuckets.js').TaskBoard} TaskBoard
 * @typedef {import('../app/boardBuckets.js').BoardContext} BoardContext
 * @typedef {import('../app/boardModel.js').BoardLayout} BoardLayout
 */

// Every drop, star or completion rebuilds the board. These keep the reader's
// place across that: where each board was scrolled to, and which lanes are folded.
/** @type {Map<string, {left: number, top: number}>} */
const scrollByBoard = new Map();
/** @type {Set<string>} */
const foldedLanes = new Set();

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
 * @param {Record<string, Function|null>} callbacks - onComplete, onStar, onEdit, onBoardMove
 */
export function renderTaskBoard(container, tasks, board, callbacks) {
  const ctx = boardContext();
  const layout = buildBoard(tasks, board, ctx);

  const el = document.createElement('div');
  el.className = 'task-board' + (board.lanes ? '' : ' task-board-unlaned');
  el.style.setProperty('--board-columns', String(layout.columns.length));

  appendColumnHeads(el, layout, board);
  for (const lane of layout.lanes) {
    const foldKey = `${board.id}\n${lane.key}`;
    const folded = foldedLanes.has(foldKey);
    if (board.lanes) {
      const count = laneCount(layout, lane.key);
      el.appendChild(
        buildLaneHead(lane.label, count, folded, function toggleLane() {
          if (folded) foldedLanes.delete(foldKey);
          else foldedLanes.add(foldKey);
          el.remove();
          renderTaskBoard(container, tasks, board, callbacks);
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
        cell.appendChild(
          buildTaskCard(task, {
            onComplete: callbacks.onComplete,
            onStar: callbacks.onStar,
            onClick: callbacks.onEdit,
          }),
        );
      }
      el.appendChild(cell);
    }
  }
  container.appendChild(el);

  const saved = scrollByBoard.get(board.id);
  if (saved) {
    el.scrollLeft = saved.left;
    el.scrollTop = saved.top;
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
    canDrop(id, cell) {
      const task = findTask(id);
      if (!task) return false;
      return dropChanges(board, task, cell.dataset.lane, cell.dataset.column, ctx) !== null;
    },
    onDrop(id, cell) {
      const task = findTask(id);
      if (!task) return;
      const changes = dropChanges(board, task, cell.dataset.lane, cell.dataset.column, ctx);
      if (changes && Object.keys(changes).length) callbacks.onBoardMove(task, changes);
    },
  });
}

/**
 * @param {HTMLElement} el
 * @param {BoardLayout} layout
 * @param {TaskBoard} board
 */
function appendColumnHeads(el, layout, board) {
  for (const column of layout.columns) {
    const head = document.createElement('div');
    head.className =
      'task-board-head sticky top-0 z-10 flex snap-start items-baseline gap-xs bg-bg px-xs py-sm text-sm font-semibold tracking-wider text-text-muted uppercase';
    const label = document.createElement('span');
    label.className = 'truncate';
    label.textContent = column.label;
    const count = document.createElement('span');
    count.className = 'font-normal';
    count.textContent = String(columnCount(layout, column.key));
    head.append(label, count);
    if (column.key === 'done' && board.columns === 'status') {
      head.title = `Completed in the last ${DONE_WINDOW_DAYS} days`;
    }
    el.appendChild(head);
  }
}

/**
 * A lane's header spans the whole row; the button inside sticks to the left
 * edge so the label stays readable however far the board is scrolled across.
 * @param {string} label
 * @param {number} count
 * @param {boolean} folded
 * @param {() => void} onToggle
 */
function buildLaneHead(label, count, folded, onToggle) {
  const row = document.createElement('div');
  row.className = 'col-span-full border-t border-border pt-xs';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className =
    'sticky left-0 flex items-center gap-xs rounded-sm px-xs py-xs text-sm font-semibold text-text';
  toggle.setAttribute('aria-expanded', String(!folded));
  const chevron = document.createElement('span');
  chevron.className = 'text-text-muted';
  chevron.textContent = folded ? '▸' : '▾';
  const name = document.createElement('span');
  name.textContent = label;
  const tally = document.createElement('span');
  tally.className = 'font-normal text-text-muted';
  tally.textContent = String(count);
  toggle.append(chevron, name, tally);
  toggle.addEventListener('click', onToggle);
  row.appendChild(toggle);
  return row;
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
