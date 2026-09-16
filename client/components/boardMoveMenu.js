import { createPickerOverlay } from './pickerOverlay.js';

const OPTION_CLASSES =
  'flex min-h-touch w-full items-center gap-sm rounded-sm px-sm text-left text-md text-text transition-colors hover:bg-surface focus-visible:bg-surface disabled:cursor-default disabled:bg-transparent disabled:text-text-muted';

/**
 * @typedef {import('../app/boardActions.js').MoveGroup} MoveGroup
 * @typedef {import('../app/boardActions.js').MoveTarget} MoveTarget
 * @typedef {import('../app/state.js').Task} Task
 */

/**
 * "Move to…" for a board card: the places the card can go, grouped by column
 * and lane, with its current place marked. The same moves a drag makes, for a
 * keyboard, a screen reader, or a phone where the target column is off screen.
 * @param {Task} task
 * @param {MoveGroup[]} groups - from boardActions.moveGroups
 * @param {(target: MoveTarget) => void} onPick
 */
export function showBoardMoveMenu(task, groups, onPick) {
  const picker = createPickerOverlay({
    id: 'board-move-menu',
    label: `Move ${task.title}`,
    panelClass: 'max-h-full overflow-y-auto',
  });

  const heading = document.createElement('p');
  heading.className = 'mb-xs truncate px-sm text-sm text-text-muted';
  heading.textContent = `Move “${task.title}” to`;
  picker.panel.appendChild(heading);

  /** @type {HTMLButtonElement|null} */
  let firstOption = null;
  for (const group of groups) {
    const section = document.createElement('div');
    section.setAttribute('role', 'group');
    section.setAttribute('aria-label', group.title);
    section.className = 'mt-sm';
    // Only name the axis when there are two; one group is plainly the columns.
    if (groups.length > 1) {
      const title = document.createElement('p');
      title.className =
        'px-sm pb-2xs text-xs font-semibold tracking-wider text-text-muted uppercase';
      title.textContent = group.title;
      section.appendChild(title);
    }
    for (const target of group.targets) {
      const option = buildOption(target.label, target.current);
      if (!target.current) {
        option.addEventListener('click', function pickTarget() {
          picker.close();
          onPick(target);
        });
        if (!firstOption) firstOption = option;
      }
      section.appendChild(option);
    }
    picker.panel.appendChild(section);
  }

  picker.mount(firstOption || undefined);
}

/**
 * @param {string} label
 * @param {boolean} current
 * @returns {HTMLButtonElement}
 */
function buildOption(label, current) {
  const option = document.createElement('button');
  option.type = 'button';
  option.className = OPTION_CLASSES;
  const mark = document.createElement('span');
  mark.className = 'w-md shrink-0 text-accent';
  mark.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'min-w-0 flex-1 truncate';
  name.textContent = label;
  option.append(mark, name);
  if (current) {
    mark.textContent = '✓';
    option.disabled = true;
    option.setAttribute('aria-current', 'true');
  }
  return option;
}
