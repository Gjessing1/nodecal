/**
 * What Settings is divided into, and what each part is called.
 *
 * Settings had grown into one 700-line scroll: every control mounted at once,
 * related preferences screens apart (task reminders under Notifications, task
 * sources under Tasks), and finding one meant remembering roughly how far down
 * it lived. The list below groups them by task instead.
 *
 * It is *data*, not markup order, on purpose — a phone renders it as a
 * drill-down menu and a wide window as a sidebar, but the sections, their names
 * and their order come from here, so the two presentations cannot drift apart.
 * Adopted from maily (`frontend/src/ui/settingsSections.ts`), which took the
 * same shape from atlas.
 */

/**
 * @typedef {object} SettingsSection
 * @property {string} id
 * @property {string} label - Menu row label, and the header title once open.
 * @property {string} hint - One line saying what is inside.
 */

/** Every settings section, in the order Settings presents them. */
/** @type {readonly SettingsSection[]} */
export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', hint: 'Default view, time and date formats' },
  { id: 'views', label: 'Views & layout', hint: 'Which views appear, week numbers, weekends' },
  { id: 'calendars', label: 'Calendars', hint: 'Default calendar and subscribed ICS feeds' },
  { id: 'events', label: 'Events', hint: 'Defaults applied to new events' },
  { id: 'tasks', label: 'Tasks', hint: 'Task sources and sort order' },
  { id: 'categories', label: 'Categories', hint: 'Hide task and event categories' },
  { id: 'notifications', label: 'Notifications', hint: 'Reminders on this device and push' },
  { id: 'profiles', label: 'Profiles', hint: 'Personal and work presets' },
  { id: 'weather', label: 'Weather', hint: 'Location and forecast days' },
  { id: 'sync', label: 'Sync & storage', hint: 'Interval, sync window and local cache' },
  { id: 'system', label: 'System', hint: 'Build, Android app and signing out' },
];

/** The calendar views that can be shown as navigation tabs. */
export const ALL_VIEWS = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

/** Nodecal shows at most five navigation tabs (calendar views plus Tasks). */
export const MAX_NAV_TABS = 5;

/**
 * The section with this id, or null — used to resolve the currently open one.
 * @param {string|null} id
 * @returns {SettingsSection|null}
 */
export function settingsSection(id) {
  for (const section of SETTINGS_SECTIONS) {
    if (section.id === id) return section;
  }
  return null;
}
