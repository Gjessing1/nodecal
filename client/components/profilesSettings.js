import { state } from '../app/state.js';
import { esc } from '../app/utils.js';
import { getProfiles, profileIds, activeProfileId, captureActiveProfile } from '../app/profiles.js';

// Accent presets — empty string means "use the theme default" (no override).
const ACCENTS = ['', '#2563eb', '#b45309', '#15803d', '#7c3aed', '#db2777', '#0891b2'];
const VIEWS = ['', 'agenda', 'day', 'week', 'month'];

// Renders the Profiles editor: an active-profile selector plus one collapsible
// card per profile (name, accent, visible calendars, default view). The editor
// mutates the live `state.config.profiles` objects in place; settingsPanel saves
// them via PUT /settings and main.js re-applies the active profile on close.
export function renderProfilesSection(sheet, cfg) {
  const section = sheet.querySelector('#s-profiles-section');
  if (!section) return;

  // Pull the latest drawer-toggled visibility into the active profile so the
  // checkboxes below reflect what's currently on screen.
  captureActiveProfile();

  const profiles = getProfiles();
  section.innerHTML = '';

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

// Per-profile target for new tasks (quick-add "To:"). Empty means "use the
// global default task source". Only the configured sources are offered.
function buildTaskSourceField(profile) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  field.innerHTML = '<label>New tasks go to</label>';
  const sources = state.taskSources || [];
  if (!sources.length) {
    const note = document.createElement('span');
    note.style.cssText = 'font-size:var(--font-size-sm);color:var(--color-text-muted)';
    note.textContent = 'Add a task source first (Settings → Task sources).';
    field.appendChild(note);
    return field;
  }
  const sel = document.createElement('select');
  const options = ['<option value="">(use global default)</option>'];
  for (const src of sources) {
    const selected = (profile.defaultTaskSource || '') === src.url ? 'selected' : '';
    options.push(`<option value="${esc(src.url)}" ${selected}>${esc(src.name || src.url)}</option>`);
  }
  sel.innerHTML = options.join('');
  sel.addEventListener('change', () => { profile.defaultTaskSource = sel.value; });
  field.appendChild(sel);
  return field;
}

function buildDefaultViewField(profile) {
  const field = document.createElement('div');
  field.className = 'modal-field';
  field.innerHTML = '<label>Default view</label>';
  const sel = document.createElement('select');
  sel.innerHTML = VIEWS.map(v =>
    `<option value="${v}" ${(profile.defaultView || '') === v ? 'selected' : ''}>${v || '(use global)'}</option>`
  ).join('');
  sel.addEventListener('change', () => { profile.defaultView = sel.value; });
  field.appendChild(sel);
  return field;
}
