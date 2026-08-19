import { ALL_VIEWS } from './sections.js';
import { field, row, select } from './fields.js';

const TIME_FORMATS = [
  { value: '24h', label: '24h (14:30)' },
  { value: '12h', label: '12h (2:30 PM)' },
];
const WEEK_STARTS = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
];
const DATE_FORMATS = [
  { value: 'dmy', label: 'dd/mm/yyyy' },
  { value: 'mdy', label: 'mm/dd/yyyy' },
  { value: 'iso', label: 'ISO (2025-05-10)' },
];

/**
 * General: which view opens first and how dates and times are written.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 */
export function renderGeneralSection(pane, draft) {
  const viewOptions = ALL_VIEWS.map((v) => ({ value: v.id, label: v.label }));
  if (draft.enableTasksView) viewOptions.push({ value: 'tasks', label: 'Tasks' });

  pane.appendChild(
    field(
      'Default view',
      select(draft.defaultView, viewOptions, (v) => {
        draft.defaultView = v;
      }),
      'The view Nodecal opens on. A profile can override it.',
    ),
  );

  pane.appendChild(
    row(
      field(
        'Time format',
        select(draft.timeFormat, TIME_FORMATS, (v) => {
          draft.timeFormat = v;
        }),
      ),
      field(
        'Week starts on',
        select(draft.weekStart, WEEK_STARTS, (v) => {
          draft.weekStart = v;
        }),
      ),
    ),
  );

  pane.appendChild(
    field(
      'Date format',
      select(draft.dateFormat || 'dmy', DATE_FORMATS, (v) => {
        draft.dateFormat = v;
      }),
    ),
  );
}
