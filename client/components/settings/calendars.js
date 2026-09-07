import { eventCalendars } from '../../app/profileTargets.js';
import { activeProfileId, getProfiles } from '../../app/profiles.js';
import { field, groupLabel, select } from './fields.js';
import { renderIcsFeeds } from './icsFeeds.js';

/**
 * The value the main Calendar settings control should show. A profile override
 * is effective ahead of the global fallback, so hiding it here made Settings
 * claim one calendar while the new-event form selected another.
 * @param {Record<string, any>} draft
 */
export function effectiveDraftCalendar(draft) {
  const profile = getProfiles(draft)[activeProfileId(draft)];
  return profile?.defaultEventCalendar || draft.defaultCalendar || '';
}

/**
 * A choice in the main Calendar section is an explicit request for what new
 * events should use now. Store it globally and clear the active profile's
 * override so that an older quick-add choice cannot continue to win silently.
 * @param {Record<string, any>} draft
 * @param {string} calendarId
 */
export function setDraftCalendar(draft, calendarId) {
  draft.defaultCalendar = calendarId;
  const profile = getProfiles(draft)[activeProfileId(draft)];
  if (profile) profile.defaultEventCalendar = '';
}

/**
 * Calendars: where new events land by default, and the read-only .ics feeds
 * subscribed alongside the CalDAV collections.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 */
export function renderCalendarsSection(pane, draft) {
  const options = [{ value: '', label: 'First available' }];
  for (const cal of eventCalendars()) {
    options.push({ value: cal.id, label: cal.name });
  }

  pane.appendChild(
    field(
      'Default calendar for new events',
      select(effectiveDraftCalendar(draft), options, (v) => {
        setDraftCalendar(draft, v);
      }),
      'Shows the active profile’s effective default. Profile-specific overrides can be set under Profiles.',
    ),
  );

  pane.appendChild(groupLabel('Subscribed calendars (ICS)'));
  const feeds = document.createElement('div');
  pane.appendChild(feeds);
  renderIcsFeeds(feeds, draft);
}
