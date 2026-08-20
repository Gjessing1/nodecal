// The two things a month cell says about what it could not draw: how much did
// not fit, and what is due that day.
//
// The count rides on the date row rather than taking a line of its own. A cell
// is about 52px wide on a phone, and a count sharing the bottom line with the
// task pill left the pill four characters — while the date row has empty space
// to its left going spare.

const MAX_TASK_TITLE = 16;

/**
 * The `+N` beside the date.
 *
 * @param {number} count - events with no room, plus tasks when the cell has no
 *   room for a pill either (the day sheet is open and the row is half height)
 * @returns {HTMLElement | null} null when everything fits
 */
export function buildCellFlag(count) {
  if (count === 0) return null;
  const flag = document.createElement('span');
  flag.className = 'month-day-flag';
  flag.textContent = `+${count}`;
  return flag;
}

/**
 * The day's open tasks, on their own line under the chips.
 *
 * @param {any[]} tasks
 * @param {() => void} onSelectDay
 * @returns {HTMLElement | null} null when nothing is due
 */
export function buildTaskPill(tasks, onSelectDay) {
  if (tasks.length === 0) return null;

  const pill = document.createElement('div');
  pill.className = 'month-task-pill';
  if (tasks.length === 1) {
    const title = tasks[0].title;
    pill.textContent = title.length > MAX_TASK_TITLE ? title.slice(0, MAX_TASK_TITLE) + '…' : title;
  } else {
    pill.textContent = `${tasks.length} tasks`;
  }

  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelectDay();
  });
  return pill;
}
