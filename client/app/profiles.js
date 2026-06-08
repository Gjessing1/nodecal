import { state } from './state.js';

// Profiles are client-side presets over the *same* CalDAV connection. Each
// profile remembers which calendars are visible (incl. ICS feed pseudo-cals),
// an optional accent colour, and per-profile defaults. The server is a dumb
// settings store: it persists the `profiles` object + `activeProfile` and never
// resolves them per request — all data is synced once and profiles only filter
// the view. See docs/ROADMAP.md "Personal / Work profile switching".

const DEFAULT_PROFILES = {
  personal: { name: 'Personal', hiddenCalendars: [], accentColor: '', defaultTaskSource: '', defaultView: '' },
  work:     { name: 'Work',     hiddenCalendars: [], accentColor: '', defaultTaskSource: '', defaultView: '' },
};

export function getProfiles() {
  const p = state.config.profiles;
  if (p && typeof p === 'object' && Object.keys(p).length) return p;
  state.config.profiles = structuredClone(DEFAULT_PROFILES);
  return state.config.profiles;
}

export function profileIds() {
  return Object.keys(getProfiles());
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
  if (p.defaultTaskSource) state.config.defaultTaskSource = p.defaultTaskSource;
  if (p.defaultView) state.config.defaultView = p.defaultView;
  applyAccent(p.accentColor);
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
