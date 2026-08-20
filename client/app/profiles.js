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
  single: {
    name: 'Single',
    hiddenCalendars: [],
    accentColor: '',
    defaultTaskSource: '',
    defaultEventCalendar: '',
    defaultView: '',
  },
  personal: {
    name: 'Personal',
    hiddenCalendars: [],
    accentColor: '',
    defaultTaskSource: '',
    defaultEventCalendar: '',
    defaultView: '',
  },
  work: {
    name: 'Work',
    hiddenCalendars: [],
    accentColor: '',
    defaultTaskSource: '',
    defaultEventCalendar: '',
    defaultView: '',
  },
  // 'Combined' is the both-at-once view: nothing hidden by default. It is an
  // ordinary profile otherwise, so the drawer can still hide a calendar in it
  // and the choice is remembered like any other.
  combined: {
    name: 'Combined',
    hiddenCalendars: [],
    accentColor: '',
    defaultTaskSource: '',
    defaultEventCalendar: '',
    defaultView: '',
  },
};

// Display order for the built-ins, and the ids the navbar pill cycles through.
export const PROFILE_ORDER = ['single', 'personal', 'work', 'combined'];
export const SWITCH_IDS = ['personal', 'work', 'combined'];

// `config` defaults to the live settings; the Settings editor passes its draft
// so edits stay uncommitted until Save.
export function getProfiles(config = state.config) {
  let p = config.profiles;
  if (!p || typeof p !== 'object' || !Object.keys(p).length) {
    p = structuredClone(DEFAULT_PROFILES);
    config.profiles = p;
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
export function profileIds(config = state.config) {
  const all = Object.keys(getProfiles(config));
  const extras = all.filter((id) => !PROFILE_ORDER.includes(id));
  return [...PROFILE_ORDER, ...extras];
}

// Single mode hides the navbar switcher; personal/work show it.
export function isSingleMode() {
  return activeProfileId() === 'single';
}

export function activeProfileId(config = state.config) {
  const id = config.activeProfile;
  const profiles = getProfiles(config);
  return profiles[id] ? id : profileIds(config)[0];
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

// Ensure every profile's chosen task source is a registered task source so the
// server actually syncs tasks from it. A profile can point at any writable
// calendar; this backfills the settings' task source list with the matching
// calendar's name. Call before persisting settings.
export function registerProfileTaskSources(config) {
  const sources = config.taskSources || (config.taskSources = []);
  const cals = state.calendars || [];
  for (const id of profileIds(config)) {
    const url = getProfiles(config)[id].defaultTaskSource;
    if (!url || sources.some((s) => s.url === url)) continue;
    const cal = cals.find((c) => c.id === url);
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
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles: getProfiles(), activeProfile: activeProfileId() }),
    });
  } catch {
    /* offline — the profile stays applied locally until next sync */
  }
}
