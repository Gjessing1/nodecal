import { buildTimePicker } from '../timePicker.js';
import { field, numberInput, row } from './fields.js';
import { timeStrToDate } from './timeValue.js';

/**
 * Events: the time and length a new event gets when nothing else says otherwise.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 */
export function renderEventsSection(pane, draft) {
  const picker = buildTimePicker(
    's-default-event-time',
    timeStrToDate(draft.defaultEventTime || '09:00'),
    'UTC',
    (value) => {
      draft.defaultEventTime = value;
    },
  );

  pane.appendChild(
    row(
      field('Default time (future dates)', picker),
      field(
        'Default duration (minutes)',
        numberInput(
          draft.defaultEventDuration || 60,
          { min: 15, max: 480, step: 15, fallback: 60 },
          (v) => {
            draft.defaultEventDuration = v;
          },
        ),
      ),
    ),
  );
}
