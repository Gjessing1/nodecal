import { state } from '../../app/state.js';
import { field, groupLabel, select } from './fields.js';
import { renderIcsFeeds } from './icsFeeds.js';

/**
 * Calendars: where new events land by default, and the read-only .ics feeds
 * subscribed alongside the CalDAV collections.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 */
export function renderCalendarsSection(pane, draft) {
  const options = [{ value: '', label: 'First available' }];
  for (const cal of state.calendars) {
    // Subscribed feeds are read-only, so they can never take a new event.
    if (cal.readOnly) continue;
    options.push({ value: cal.id, label: cal.name });
  }

  pane.appendChild(
    field(
      'Default calendar for new events',
      select(draft.defaultCalendar || '', options, (v) => {
        draft.defaultCalendar = v;
      }),
      'A profile can point new events at a different calendar.',
    ),
  );

  pane.appendChild(groupLabel('Subscribed calendars (ICS)'));
  const feeds = document.createElement('div');
  pane.appendChild(feeds);
  renderIcsFeeds(feeds, draft);
}
