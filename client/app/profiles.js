import { state } from './state.js';

// Profiles are client-side presets over the *same* CalDAV connection. Each
// profile remembers which calendars are visible (incl. ICS feed pseudo-cals),
// an optional accent colour, and per-profile defaults. The server is a dumb
// settings store: it persists the `profiles` object + `activeProfile` and never
// resolves them per request — all data is synced once and profiles only filter
// the view. See docs/ROADMAP.md "Personal / Work profile switching".

// Built-in profiles. 'single' is the no-switcher mode; 'personal'/'work' are the
// two-profile mode that shows the navbar switcher. The active profile id alone
// decides the mode — no separate flag.
const DEFAULT_PROFILES = {
  single:   { name: 'Single',   hiddenCalendars: [], accentColor: '', defaultTaskSource: '', defaultEventCalendar: '', defaultView: '' },
  personal: { name: 'Personal', hiddenCalendars: [], accentColor: '', defaultTaskSource: '', defaultEventCalendar: '', defaultView: '' },
  work:     { name: 'Work',     hiddenCalendars: [], accentColor: '', defaultTaskSource: '', defaultEventCalendar: '', defaultView: '' },
};

// Display order for the built-ins and the two ids that form the switcher pair.
export const PROFILE_ORDER = ['single', 'personal', 'work'];
export const DUAL_IDS = ['personal', 'work'];

export function getProfiles() {
  let p = state.config.profiles;
  if (!p || typeof p !== 'object' || !Object.keys(p).length) {
    p = structuredClone(DEFAULT_PROFILES);
    state.config.profiles = p;
    return p;
  }
  // Backfill any built-in profile missing from older saved settings (e.g.
  // 'single', added later) so all three modes stay available without dropping
  // the user's existing customizations.
  for (const id of PROFILE_ORDER) {
    if (!p[id]) p[id] = structuredClone(DEFAULT_PROFILES[id]);
  }
  return p;
}

// Built-ins first (in canonical order), then any user-defined extras.
export function profileIds() {
  const all = Object.keys(getProfiles());
  const extras = all.filter(id => !PROFILE_ORDER.includes(id));
  return [...PROFILE_ORDER, ...extras];
}

// Single mode hides the navbar switcher; personal/work show it.
export function isSingleMode() {
  return activeProfileId() === 'single';
}

export function activeProfileId() {
  const id = state.config.activeProfile;
  const profiles = getProfiles();
  return profiles[id] ? id : profileIds()[0];
}

export function activeProfile() {
  return getProfiles()[activeProfileId()];
}

// Apply a profile's stored view onto live state: which calendars are hidden,
// the accent colour, and any per-profile defaults. Missing calendar ids in
// hiddenCalendars are harmless — they simply match nothing.
export function applyProfile(id) {
  const p = getProfiles()[id];
  if (!p) return;
  state.config.activeProfile = id;
  state.hiddenCalendars = new Set(p.hiddenCalendars || []);
  if (p.defaultView) state.config.defaultView = p.defaultView;
  applyAccent(p.accentColor);
}

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

// Ensure every profile's chosen task source is a registered task source so the
// server actually syncs tasks from it. A profile can point at any writable
// calendar; this backfills `state.taskSources` with the matching calendar's
// name. Call before persisting settings.
export function registerProfileTaskSources() {
  const sources = state.taskSources || (state.taskSources = []);
  const cals = state.calendars || [];
  for (const id of profileIds()) {
    const url = getProfiles()[id].defaultTaskSource;
    if (!url || sources.some(s => s.url === url)) continue;
    const cal = cals.find(c => c.id === url);
    sources.push({ url, name: cal ? cal.name : url });
  }
}

// Capture the live, user-adjustable view state back into the active profile.
// Today that is only the calendar visibility set, toggled via the drawer.
export function captureActiveProfile() {
  const p = activeProfile();
  if (!p) return;
  p.hiddenCalendars = [...state.hiddenCalendars];
}

// Override the global accent colour for the active profile. Empty string clears
// the override so the theme default applies again.
export function applyAccent(color) {
  const root = document.documentElement;
  if (color) root.style.setProperty('--color-accent', color);
  else root.style.removeProperty('--color-accent');
}

export async function persistProfiles() {
  try {
    await fetch('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles: getProfiles(), activeProfile: activeProfileId() }),
    });
  } catch { /* offline — the profile stays applied locally until next sync */ }
}
