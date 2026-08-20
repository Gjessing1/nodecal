import { state } from './state.js';
import { activeProfile, persistProfiles } from './profiles.js';

// Where a new event or task lands. Kept apart from profiles.js because this is
// the *write* side of a profile — the quick-add bars both read a target here and
// write the one the user picked back, so the next new item defaults to it.

// Resolve which task source new tasks should land in: the active profile's
// override if set, otherwise the global default. Computed at point of use so
// switching profiles changes the quick-add target without clobbering the
// global `defaultTaskSource` setting.
export function effectiveTaskSource() {
  return activeProfile()?.defaultTaskSource || state.config.defaultTaskSource || '';
}

// Resolve which calendar new events should land in: the active profile's
// override if set, otherwise the global default. Computed at point of use so
// switching profiles changes the target without clobbering the global
// `defaultCalendar` setting.
export function effectiveEventCalendar() {
  return activeProfile()?.defaultEventCalendar || state.config.defaultCalendar || '';
}

/**
 * Remember the calendar a quick-add just targeted, on the active profile. This
 * is what makes the "To:" row sticky: the Combined profile shows every calendar,
 * so the last choice is the only sensible default for the next one.
 * @param {string} calendarId
 */
export function rememberEventCalendar(calendarId) {
  const p = activeProfile();
  if (!p || !calendarId || p.defaultEventCalendar === calendarId) return;
  p.defaultEventCalendar = calendarId;
  if (!state.isOffline) persistProfiles();
}

/**
 * Remember the task source a quick-add just targeted, on the active profile.
 * @param {string} url
 */
export function rememberTaskSource(url) {
  const p = activeProfile();
  if (!p || !url || p.defaultTaskSource === url) return;
  p.defaultTaskSource = url;
  if (!state.isOffline) persistProfiles();
}

/**
 * The calendar a new event actually lands in: the remembered target if it is
 * still offered, else the first calendar this profile shows. The quick-add row
 * and the write path both go through here so the chip shown as active is always
 * the one that gets written to.
 * @returns {string | undefined}
 */
export function resolveEventCalendar() {
  const offered = targetCalendars();
  const wanted = effectiveEventCalendar();
  if (wanted && offered.some((c) => c.id === wanted)) return wanted;
  return offered[0]?.id || state.calendars[0]?.id;
}

/**
 * Calendars a new item can actually be written to in the current profile:
 * writable (ICS feeds are not) and not hidden by the profile. The quick-add
 * "To:" row only appears when this returns more than one — which in practice
 * means the Combined profile.
 * @returns {Array<any>}
 */
export function targetCalendars() {
  const cals = state.calendars || [];
  return cals.filter((c) => !c.readOnly && !state.hiddenCalendars.has(c.id));
}
