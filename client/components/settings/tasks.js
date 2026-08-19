import { field, groupLabel, select } from './fields.js';
import { renderTaskSources } from './taskSources.js';

const SORT_ORDERS = [
  { value: 'due', label: 'Due date' },
  { value: 'starred', label: 'Starred first' },
  { value: 'alpha', label: 'Alphabetical' },
  { value: 'created', label: 'Creation date' },
];

/**
 * Tasks: where tasks are stored and how the list is ordered.
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
}
