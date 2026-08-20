// The task chips in the week's all-day strip. They stay per-day — a task is due
// on one day, it never spans — so they sit in their own day column, in the grid
// rows left over under the event bars.

const MAX_TASKS = 2;

/**
 * @typedef {object} DayTaskChips
 * @property {any[]} shown - the tasks that get a chip
 * @property {number} overflow - how many are left for the "+N tasks" line
 */

/**
 * The task chips one day shows: two, or three when that beats a "+1 tasks" line
 * that would have cost the same room.
 * @param {any[]} tasks
 * @param {string} dayStr - YYYY-MM-DD, local
 * @returns {DayTaskChips}
 */
export function visibleTasks(tasks, dayStr) {
  const due = tasks.filter((t) => t.due === dayStr);
  const limit = due.length === MAX_TASKS + 1 ? MAX_TASKS + 1 : MAX_TASKS;
  return { shown: due.slice(0, limit), overflow: due.length - limit };
}

/** How many grid rows a day's task chips need. */
export function taskRowCount(entry) {
  return entry.shown.length + (entry.overflow > 0 ? 1 : 0);
}

/**
 * @param {HTMLElement} row - the all-day grid
 * @param {DayTaskChips} entry
 * @param {number} colIdx - 0 = Monday
 * @param {number} laneCount - how many rows the event bars already took
 * @param {() => void} openPopup
 * @param {((task: any) => void) | null | undefined} onTaskClick
 */
export function appendTaskChips(row, entry, colIdx, laneCount, openPopup, onTaskClick) {
  let gridRow = laneCount + 1;
  for (const task of entry.shown) {
    const chip = placeChip(row, colIdx, gridRow, 'allday-chip task-allday-chip');
    chip.textContent = task.title;
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onTaskClick) onTaskClick(task);
    });
    gridRow++;
  }
  if (entry.overflow > 0) {
    const more = placeChip(row, colIdx, gridRow, 'allday-chip task-allday-chip allday-more');
    more.textContent = `+${entry.overflow} tasks`;
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      openPopup();
    });
  }
}

/**
 * @param {HTMLElement} row
 * @param {number} colIdx
 * @param {number} gridRow
 * @param {string} className
 */
function placeChip(row, colIdx, gridRow, className) {
  const chip = document.createElement('div');
  chip.className = className;
  chip.style.gridColumn = String(colIdx + 2);
  chip.style.gridRow = String(gridRow);
  row.appendChild(chip);
  return chip;
}
