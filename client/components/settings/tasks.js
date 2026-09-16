import { field, groupLabel, select } from './fields.js';
import { renderTaskSources } from './taskSources.js';
import { renderTaskBoards } from './taskBoards.js';

const SORT_ORDERS = [
  { value: 'due', label: 'Due date' },
  { value: 'starred', label: 'Starred first' },
  { value: 'priority', label: 'Priority' },
  { value: 'alpha', label: 'Alphabetical' },
  { value: 'created', label: 'Creation date' },
];

/**
 * Tasks: where tasks are stored, how the list is ordered, and the kanban boards.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 */
export function renderTasksSection(pane, draft) {
  pane.appendChild(groupLabel('Task sources'));
  const sources = document.createElement('div');
  pane.appendChild(sources);
  renderTaskSources(sources, draft);

  pane.appendChild(
    field(
      'Default task sort',
      select(draft.taskSortOrder, SORT_ORDERS, (v) => {
        draft.taskSortOrder = v;
      }),
    ),
  );

  pane.appendChild(groupLabel('Boards'));
  const boards = document.createElement('div');
  pane.appendChild(boards);
  renderTaskBoards(boards, draft);
}
