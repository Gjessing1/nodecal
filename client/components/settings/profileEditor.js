import { state } from '../../app/state.js';
import { field, help, select, toggle } from './fields.js';
import { ALL_VIEWS } from './sections.js';

// Accent presets — empty string means "use the theme default" (no override).
const ACCENTS = ['', '#2563eb', '#b45309', '#15803d', '#7c3aed', '#db2777', '#0891b2'];

/**
 * One profile's card: name, accent, which calendars it shows, and where its new
 * tasks and events go. Fields mutate the profile object inside the draft, so
 * nothing is persisted until Settings is saved.
 * @param {string} id
 * @param {Record<string, any>} profile
 * @param {Record<string, any>} draft
 */
export function buildProfileEditor(id, profile, draft) {
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
  body.appendChild(buildTaskSourceField(profile, draft));
  body.appendChild(buildEventCalendarField(profile));
  body.appendChild(buildDefaultViewField(profile, draft));

  wrap.append(header, body);
  return wrap;
}

function buildNameField(profile, id, titleEl) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = profile.name || '';
  input.addEventListener('input', () => {
    profile.name = input.value;
    titleEl.textContent = ' ' + (input.value || id);
  });
  return field('Name', input);
}

function buildAccentField(profile) {
  const row = document.createElement('div');
  row.className = 'profile-accent-row';
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
  return field('Accent colour', row);
}

function buildCalendarsField(profile) {
  const list = document.createElement('div');
  if (!state.calendars.length) {
    list.appendChild(help('Sync first to list calendars.'));
    return field('Visible calendars', list);
  }
  const hidden = new Set(profile.hiddenCalendars || []);
  for (const cal of state.calendars) {
    list.appendChild(
      toggle(cal.name, !hidden.has(cal.id), (checked) => {
        if (checked) hidden.delete(cal.id);
        else hidden.add(cal.id);
        profile.hiddenCalendars = [...hidden];
      }),
    );
  }
  return field('Visible calendars', list);
}

/**
 * Per-profile target for new tasks (quick-add "To:"). Every writable calendar is
 * offered so each profile can point at a different one; the chosen calendar is
 * registered as a task source on save (registerProfileTaskSources) so the server
 * actually syncs tasks from it. cal.id is the collection URL, identical to a
 * task source's `url`.
 */
function buildTaskSourceField(profile, draft) {
  const cals = writableCalendars();
  if (!cals.length) return field('Task source', help('Sync first to list calendars.'));

  // Pre-select the profile's stored source if it still matches a calendar, else
  // the global default, else the first calendar.
  let current = profile.defaultTaskSource;
  if (!cals.some((c) => c.id === current)) {
    current = cals.some((c) => c.id === draft.defaultTaskSource)
      ? draft.defaultTaskSource
      : cals[0].id;
  }
  // Persist the resolved value immediately so an untouched dropdown still saves
  // the concrete source it is showing.
  profile.defaultTaskSource = current;

  const control = select(
    current,
    cals.map((c) => ({ value: c.id, label: c.name })),
    (v) => {
      profile.defaultTaskSource = v;
    },
  );
  return field(
    'Task source',
    control,
    'Each profile can use a different calendar — it is registered as a task source automatically.',
  );
}

/**
 * Per-profile target calendar for new events. The empty option falls back to the
 * global `defaultCalendar` via effectiveEventCalendar().
 */
function buildEventCalendarField(profile) {
  const cals = writableCalendars();
  if (!cals.length) {
    return field('Default calendar for new events', help('Sync first to list calendars.'));
  }
  const options = [{ value: '', label: '(use global default)' }];
  for (const cal of cals) options.push({ value: cal.id, label: cal.name });

  return field(
    'Default calendar for new events',
    select(profile.defaultEventCalendar || '', options, (v) => {
      profile.defaultEventCalendar = v;
    }),
  );
}

function buildDefaultViewField(profile, draft) {
  const options = [{ value: '', label: '(use global)' }];
  for (const view of ALL_VIEWS) options.push({ value: view.id, label: view.label });
  // 'tasks' is only a valid default when the Tasks tab is enabled.
  if (draft.enableTasksView) options.push({ value: 'tasks', label: 'Tasks' });

  return field(
    'Default view',
    select(profile.defaultView || '', options, (v) => {
      profile.defaultView = v;
    }),
  );
}

/** Read-only calendars (subscribed ICS feeds) can never be written to. */
function writableCalendars() {
  return (state.calendars || []).filter((c) => !c.readOnly);
}
