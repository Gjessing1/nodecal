import { getProfiles, profileIds, activeProfileId } from '../../app/profiles.js';
import { field, help, select } from './fields.js';
import { buildProfileEditor } from './profileEditor.js';

/**
 * Profiles: presets over the same CalDAV connection — which calendars a profile
 * shows, its accent, and where its new tasks and events go. 'Single' is the
 * no-switcher mode; Personal/Work put the switcher in the navbar.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 */
export function renderProfilesSection(pane, draft) {
  const profiles = getProfiles(draft);
  const ids = profileIds(draft);

  pane.appendChild(
    help(
      'Per-profile overrides of the global settings — calendar visibility, accent, task source and default view.',
    ),
  );

  pane.appendChild(
    field(
      'Active profile',
      select(
        activeProfileId(draft),
        ids.map((id) => ({ value: id, label: profiles[id].name || id })),
        (v) => {
          draft.activeProfile = v;
        },
      ),
      'Single hides the navbar switcher. Personal / Work / Combined shows it, and tapping the pill steps through the three.',
    ),
  );

  for (const id of ids) {
    pane.appendChild(buildProfileEditor(id, profiles[id], draft));
  }
}
