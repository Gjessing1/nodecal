import { state } from '../app/state.js';
import { esc } from '../app/utils.js';
import { getProfiles, profileIds, activeProfileId, captureActiveProfile } from '../app/profiles.js';

// Accent presets — empty string means "use the theme default" (no override).
const ACCENTS = ['', '#2563eb', '#b45309', '#15803d', '#7c3aed', '#db2777', '#0891b2'];
const BASE_VIEWS = ['', 'agenda', 'day', 'week', 'month'];

// Renders the Profiles editor: an active-profile selector plus one collapsible
// card per profile (name, accent, visible calendars, task source, default
// view). 'Single' is the no-switcher mode; 'Personal'/'Work' show the navbar
// switcher. The editor mutates the live `state.config.profiles` objects in
// place; settingsPanel saves them via PUT /settings and main.js re-applies the
// active profile on close.
export function renderProfilesSection(sheet, cfg) {
  const section = sheet.querySelector('#s-profiles-section');
  if (!section) return;

  // Pull the latest drawer-toggled visibility into the active profile so the
  // checkboxes below reflect what's currently on screen.
  captureActiveProfile();

  const profiles = getProfiles();
  section.innerHTML = '';

  const intro = document.createElement('p');
  intro.style.cssText = 'font-size:var(--font-size-sm);color:var(--color-text-muted);margin:4px 0 0;padding:0 var(--space-md)';
  intro.textContent = 'Per-profile overrides of the global settings above — calendar visibility, accent, task source and default view.';
  section.appendChild(intro);

  const activeField = document.createElement('div');
  activeField.className = 'modal-field';
  activeField.innerHTML = '<label>Active profile</label>';
  const activeSel = document.createElement('select');
  activeSel.id = 's-active-profile';
  activeSel.innerHTML = profileIds().map(id =>
    `<option value="${esc(id)}" ${activeProfileId() === id ? 'selected' : ''}>${esc(profiles[id].name || id)}</option>`
  ).join('');
  activeSel.addEventListener('change', () => { state.config.activeProfile = activeSel.value; });
  activeField.appendChild(activeSel);
  const hint = document.createElement('span');
  hint.style.cssText = 'font-size:var(--font-size-sm);color:var(--color-text-muted);display:block;margin-top:4px';
  hint.textContent = 'Single hides the navbar switcher. Personal / Work shows it.';
  activeField.appendChild(hint);
  section.appendChild(activeField);

  for (const id of profileIds()) {
    section.appendChild(buildProfileEditor(id, profiles[id]));
  }
}

function buildProfileEditor(id, profile) {
  const wrap = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'modal-section-label settings-collapse-header';
  const arrow = document.createElement('span');
  arrow.className = 'settings-collapse-arrow';
  arrow.textContent = '▶';
  const title = document.createElement('span');
  title.textContent = ' ' + (profile.name || id);
  header.append(arrow, title);

  const body = document.createElement('div');
  body.className = 'settings-collapse-body';
  body.hidden = true;
  header.addEventListener('click', () => {
    body.hidden = !body.hidden;
    arrow.textContent = body.hidden ? '▶' : '▼';
  });

  body.appendChild(buildNameField(profile, id, title));
  body.appendChild(buildAccentField(profile));
  body.appendChild(buildCalendarsField(profile));
  body.appendChild(buildTaskSourceField(profile));
  body.appendChild(buildEventCalendarField(profile));
  body.appendChild(buildDefaultViewField(profile));

  wrap.append(header, body);
  return wrap;
}

function buildNameField(profile, id, titleEl) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  field.innerHTML = '<label>Name</label>';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = profile.name || '';
  input.addEventListener('input', () => {
    profile.name = input.value;
    titleEl.textContent = ' ' + (input.value || id);
  });
  field.appendChild(input);
  return field;
}

function buildAccentField(profile) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  field.innerHTML = '<label>Accent colour</label>';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  for (const color of ACCENTS) {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'profile-accent-sw' + ((profile.accentColor || '') === color ? ' active' : '');
    sw.style.background = color || 'var(--color-surface)';
    if (!color) sw.textContent = 'Default';
    sw.addEventListener('click', () => {
      profile.accentColor = color;
      for (const el of row.querySelectorAll('.profile-accent-sw')) el.classList.remove('active');
      sw.classList.add('active');
    });
    row.appendChild(sw);
  }
  field.appendChild(row);
  return field;
}

function buildCalendarsField(profile) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  field.innerHTML = '<label>Visible calendars</label>';
  const hidden = new Set(profile.hiddenCalendars || []);
  if (!state.calendars.length) {
    const note = document.createElement('span');
    note.style.cssText = 'font-size:var(--font-size-sm);color:var(--color-text-muted)';
    note.textContent = 'Sync first to list calendars.';
    field.appendChild(note);
  }
  for (const cal of state.calendars) {
    const label = document.createElement('label');
    label.className = 'settings-toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !hidden.has(cal.id);
    cb.addEventListener('change', () => {
      if (cb.checked) hidden.delete(cal.id);
      else hidden.add(cal.id);
      profile.hiddenCalendars = [...hidden];
    });
    const span = document.createElement('span');
    span.textContent = cal.name;
    label.append(cb, span);
    field.appendChild(label);
  }
  return field;
}

// Per-profile target for new tasks (quick-add "To:") — the calendar collection
// that stores this profile's tasks. Every writable calendar is offered so each
// profile can point at a different one; the chosen calendar is auto-registered
// as a task source on save (registerProfileTaskSources) so the server actually
// syncs tasks from it. cal.id is the collection URL, identical to a task
// source's `url`.
function buildTaskSourceField(profile) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  field.innerHTML = '<label>Task source</label>';
  const cals = (state.calendars || []).filter(c => !c.readOnly);
  if (!cals.length) {
    const note = document.createElement('span');
    note.style.cssText = 'font-size:var(--font-size-sm);color:var(--color-text-muted)';
    note.textContent = 'Sync first to list calendars.';
    field.appendChild(note);
    return field;
  }
  // Pre-select the profile's stored source if it still matches a calendar, else
  // the global default, else the first calendar.
  let current = profile.defaultTaskSource;
  if (!cals.some(c => c.id === current)) {
    current = cals.some(c => c.id === state.config.defaultTaskSource)
      ? state.config.defaultTaskSource
      : cals[0].id;
  }
  const sel = document.createElement('select');
  sel.innerHTML = cals.map(c =>
    `<option value="${esc(c.id)}" ${current === c.id ? 'selected' : ''}>${esc(c.name)}</option>`
  ).join('');
  // Persist the resolved value immediately so an untouched dropdown still saves
  // the concrete source it is showing.
  profile.defaultTaskSource = current;
  sel.addEventListener('change', () => { profile.defaultTaskSource = sel.value; });
  field.appendChild(sel);
  const hint = document.createElement('span');
  hint.style.cssText = 'font-size:var(--font-size-sm);color:var(--color-text-muted);display:block;margin-top:4px';
  hint.textContent = 'Each profile can use a different calendar — it is registered as a task source automatically.';
  field.appendChild(hint);
  return field;
}

// Per-profile target calendar for new events. Empty value falls back to the
// global `defaultCalendar` setting via effectiveEventCalendar(). Read-only
// calendars are excluded since events can't be created in them.
function buildEventCalendarField(profile) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  field.innerHTML = '<label>Default calendar for new events</label>';
  const cals = (state.calendars || []).filter(c => !c.readOnly);
  if (!cals.length) {
    const note = document.createElement('span');
    note.style.cssText = 'font-size:var(--font-size-sm);color:var(--color-text-muted)';
    note.textContent = 'Sync first to list calendars.';
    field.appendChild(note);
    return field;
  }
  const current = profile.defaultEventCalendar || '';
  const sel = document.createElement('select');
  const globalOpt = `<option value="" ${current === '' ? 'selected' : ''}>(use global default)</option>`;
  sel.innerHTML = globalOpt + cals.map(c =>
    `<option value="${esc(c.id)}" ${current === c.id ? 'selected' : ''}>${esc(c.name)}</option>`
  ).join('');
  sel.addEventListener('change', () => { profile.defaultEventCalendar = sel.value; });
  field.appendChild(sel);
  return field;
}

function buildDefaultViewField(profile) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  field.innerHTML = '<label>Default view</label>';
  // 'tasks' is only a valid default when the Tasks tab is enabled.
  const views = [...BASE_VIEWS];
  if (state.config.enableTasksView) views.push('tasks');
  const sel = document.createElement('select');
  sel.innerHTML = views.map(v =>
    `<option value="${v}" ${(profile.defaultView || '') === v ? 'selected' : ''}>${v || '(use global)'}</option>`
  ).join('');
  sel.addEventListener('change', () => { profile.defaultView = sel.value; });
  field.appendChild(sel);
  return field;
}
