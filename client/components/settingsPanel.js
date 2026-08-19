import { state } from '../app/state.js';
import { captureActiveProfile } from '../app/profiles.js';
import { SETTINGS_SECTIONS, settingsSection } from './settings/sections.js';
import { saveSettings } from './settings/save.js';
import { renderGeneralSection } from './settings/general.js';
import { renderViewsSection } from './settings/views.js';
import { renderCalendarsSection } from './settings/calendars.js';
import { renderEventsSection } from './settings/events.js';
import { renderTasksSection } from './settings/tasks.js';
import { renderCategoriesSection } from './settings/categories.js';
import { renderNotificationsSection } from './settings/notifications.js';
import { renderProfilesSection } from './settings/profiles.js';
import { renderWeatherSection } from './settings/weather.js';
import { renderSyncSection } from './settings/sync.js';
import { renderSystemSection } from './settings/system.js';

/** Section id → the function that fills the pane. Keys mirror SETTINGS_SECTIONS. */
const RENDERERS = {
  general: renderGeneralSection,
  views: renderViewsSection,
  calendars: renderCalendarsSection,
  events: renderEventsSection,
  tasks: renderTasksSection,
  categories: renderCategoriesSection,
  notifications: renderNotificationsSection,
  profiles: renderProfilesSection,
  weather: renderWeatherSection,
  sync: renderSyncSection,
  system: renderSystemSection,
};

// Above this width the section menu becomes a sidebar and a section is always
// on screen; below it, Settings drills into one section at a time.
const WIDE = '(min-width: 768px)';

let overlay, onChangeCb;
/** Working copy of the settings. Sections write into it; Save persists it. */
let draft = null;
/** @type {string|null} the section being shown, or null for the menu. */
let openId = null;

export function initSettingsPanel(onChange) {
  overlay = document.getElementById('settings-overlay');
  onChangeCb = onChange;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSettings();
  });
  // Rotating the phone can flip between the sidebar and the drill-down.
  window.matchMedia(WIDE).addEventListener('change', () => {
    if (draft && !overlay.classList.contains('hidden')) renderPanel();
  });
}

export function openSettings() {
  // Drawer toggles land on the active profile rather than on state.config, so
  // fold them in before cloning or the editor would show stale visibility.
  captureActiveProfile();
  draft = structuredClone(state.config);
  draft.taskSources = structuredClone(state.taskSources || []);
  openId = null;
  renderPanel();
  overlay.classList.remove('hidden');
}

export function closeSettings() {
  overlay.classList.add('hidden');
  draft = null;
}

/**
 * Back gesture inside Settings: pop the drill before the sheet itself closes.
 * @returns {boolean} true when the press was consumed here
 */
export function settingsBack() {
  if (!overlay || overlay.classList.contains('hidden')) return false;
  if (isWide() || !openId) return false;
  openId = null;
  renderPanel();
  return true;
}

function isWide() {
  return window.matchMedia(WIDE).matches;
}

function renderPanel() {
  const wide = isWide();
  const opened = settingsSection(openId);
  // A wide window always has a section on screen; a phone starts on the menu.
  const current = opened || (wide ? SETTINGS_SECTIONS[0] : null);
  const drilled = !wide && !!opened;

  const sheet = overlay.querySelector('.settings-sheet');
  sheet.innerHTML = '';
  sheet.appendChild(buildHeader(drilled, opened));

  const body = document.createElement('div');
  body.className = 'settings-body';
  if (!drilled) body.appendChild(buildNav(wide, current));
  if (current && (wide || drilled)) body.appendChild(buildPane(current, wide));
  sheet.appendChild(body);

  sheet.appendChild(buildActions());
}

function buildHeader(drilled, opened) {
  const header = document.createElement('header');
  header.className = 'settings-header';

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'icon-btn';
  back.textContent = drilled ? '‹' : '✕';
  back.setAttribute('aria-label', drilled ? 'Back to settings' : 'Close settings');
  back.addEventListener('click', () => {
    if (!drilled) {
      closeSettings();
      return;
    }
    openId = null;
    renderPanel();
  });

  const title = document.createElement('h2');
  title.className = 'settings-heading';
  title.textContent = drilled && opened ? opened.label : 'Settings';

  header.append(back, title);
  return header;
}

function buildNav(wide, current) {
  const nav = document.createElement('nav');
  nav.className = 'settings-nav';
  nav.setAttribute('aria-label', 'Settings sections');

  for (const section of SETTINGS_SECTIONS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'settings-nav-row';
    if (current && current.id === section.id) {
      row.setAttribute('aria-current', 'page');
      if (wide) row.classList.add('active');
    }

    const label = document.createElement('span');
    label.className = 'settings-nav-label';
    label.textContent = section.label;
    const hint = document.createElement('span');
    hint.className = 'settings-nav-hint';
    hint.textContent = section.hint;
    const text = document.createElement('span');
    text.className = 'settings-nav-text';
    text.append(label, hint);
    row.appendChild(text);

    if (!wide) {
      const chevron = document.createElement('span');
      chevron.className = 'settings-nav-chevron';
      chevron.textContent = '›';
      row.appendChild(chevron);
    }

    row.addEventListener('click', () => {
      openId = section.id;
      renderPanel();
    });
    nav.appendChild(row);
  }
  return nav;
}

function buildPane(section, wide) {
  const pane = document.createElement('main');
  pane.className = 'settings-pane';

  const inner = document.createElement('div');
  inner.className = 'settings-pane-inner';
  // A phone already names the open section in the header; a sidebar layout
  // needs the pane to say which row it belongs to.
  if (wide) {
    const heading = document.createElement('h3');
    heading.className = 'settings-pane-heading';
    heading.textContent = section.label;
    inner.appendChild(heading);
  }
  pane.appendChild(inner);

  RENDERERS[section.id](inner, draft, { close: closeSettings, refresh: () => onChangeCb() });
  return pane;
}

function buildActions() {
  const actions = document.createElement('footer');
  actions.className = 'settings-actions';

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn btn-primary';
  save.textContent = 'Save';
  save.addEventListener('click', async () => {
    save.disabled = true;
    const saved = await saveSettings(draft);
    save.disabled = false;
    if (!saved) return;
    closeSettings();
    onChangeCb();
  });

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn btn-ghost';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', closeSettings);

  actions.append(save, cancel);
  return actions;
}
