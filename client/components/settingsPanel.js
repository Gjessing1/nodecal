import { state, setConfig } from '../app/state.js';

const ALL_VIEWS = [
  { id: 'agenda', label: 'Agenda' },
  { id: 'day',    label: 'Day' },
  { id: 'week',   label: 'Week' },
  { id: 'month',  label: 'Month' },
];

let overlay, onChangeCb;

export function initSettingsPanel(onChange) {
  overlay = document.getElementById('settings-overlay');
  onChangeCb = onChange;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeSettings(); });
}

export function openSettings() {
  renderForm();
  overlay.classList.remove('hidden');
}

export function closeSettings() {
  overlay.classList.add('hidden');
}

function renderForm() {
  const sheet = overlay.querySelector('.modal-sheet');
  const cfg = state.config;
  const enabled = cfg.enabledViews || ALL_VIEWS.map(v => v.id);

  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">Settings</div>

    <div class="modal-field">
      <label>Visible views</label>
      ${ALL_VIEWS.map(v => `
        <label class="settings-toggle">
          <input type="checkbox" name="view" value="${v.id}" ${enabled.includes(v.id) ? 'checked' : ''}>
          <span>${v.label}</span>
        </label>`).join('')}
    </div>

    <div class="modal-field">
      <label>Default view</label>
      <select id="s-default">
        ${ALL_VIEWS.map(v => `<option value="${v.id}" ${cfg.defaultView === v.id ? 'selected' : ''}>${v.label}</option>`).join('')}
      </select>
    </div>

    <div class="modal-field">
      <label>Time format</label>
      <select id="s-timefmt">
        <option value="24h" ${cfg.timeFormat === '24h' ? 'selected' : ''}>24h (14:30)</option>
        <option value="12h" ${cfg.timeFormat === '12h' ? 'selected' : ''}>12h (2:30 PM)</option>
      </select>
    </div>

    <div class="modal-field">
      <label>Week starts on</label>
      <select id="s-weekstart">
        <option value="monday" ${cfg.weekStart === 'monday' ? 'selected' : ''}>Monday</option>
        <option value="sunday" ${cfg.weekStart === 'sunday' ? 'selected' : ''}>Sunday</option>
      </select>
    </div>

    <div class="modal-field">
      <label>Default calendar for new events</label>
      <select id="s-defcal">
        <option value="">First available</option>
        ${state.calendars.map(c => `<option value="${esc(c.id)}" ${cfg.defaultCalendar === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>

    <div class="modal-section-label">Tasks</div>

    <div class="modal-field">
      <label>Tasks calendar</label>
      <select id="s-tasks-cal">
        <option value="">— None —</option>
        ${state.calendars.map(c => `<option value="${esc(c.id)}" ${cfg.tasksCalDAVUrl === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        <option value="__custom__" ${cfg.tasksCalDAVUrl && !state.calendars.find(c => c.id === cfg.tasksCalDAVUrl) ? 'selected' : ''}>Custom URL…</option>
      </select>
    </div>
    <div class="modal-field" id="s-tasks-custom-row" style="${cfg.tasksCalDAVUrl && !state.calendars.find(c => c.id === cfg.tasksCalDAVUrl) ? '' : 'display:none'}">
      <label>Custom CalDAV URL</label>
      <input type="url" id="s-tasks-url" value="${esc(cfg.tasksCalDAVUrl || '')}" placeholder="https://…/user/tasks/">
    </div>

    <div class="modal-field">
      <label class="settings-toggle">
        <input type="checkbox" id="s-tasks-enable" ${cfg.enableTasksView ? 'checked' : ''}>
        <span>Enable tasks view (adds Tasks tab)</span>
      </label>
    </div>

    <div class="modal-field">
      <label class="settings-toggle">
        <input type="checkbox" id="s-tasks-on-cal" ${cfg.showTasksOnCalendar ? 'checked' : ''}>
        <span>Show tasks on calendar views</span>
      </label>
    </div>

    <div class="modal-field">
      <label>Task sort order</label>
      <select id="s-tasks-sort">
        <option value="due"     ${cfg.taskSortOrder === 'due'     ? 'selected' : ''}>Due date</option>
        <option value="alpha"   ${cfg.taskSortOrder === 'alpha'   ? 'selected' : ''}>Alphabetical</option>
        <option value="created" ${cfg.taskSortOrder === 'created' ? 'selected' : ''}>Creation date</option>
      </select>
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary" id="s-save">Save</button>
      <button class="btn btn-ghost" id="s-cancel">Cancel</button>
      ${cfg.authEnabled ? '<button class="btn btn-ghost" id="s-logout" style="color:var(--color-danger)">Log out</button>' : ''}
    </div>
  `;

  sheet.querySelector('#s-tasks-cal').addEventListener('change', e => {
    const customRow = sheet.querySelector('#s-tasks-custom-row');
    customRow.style.display = e.target.value === '__custom__' ? '' : 'none';
  });

  sheet.querySelector('#s-save').addEventListener('click', handleSave);
  sheet.querySelector('#s-cancel').addEventListener('click', closeSettings);
  if (cfg.authEnabled) {
    sheet.querySelector('#s-logout').addEventListener('click', handleLogout);
  }
}

async function handleLogout() {
  await fetch('/logout', { method: 'POST' });
  window.location.reload();
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function handleSave() {
  const sheet = overlay.querySelector('.modal-sheet');
  const enabledViews    = Array.from(sheet.querySelectorAll('input[name="view"]:checked')).map(c => c.value);
  const enableTasksView = sheet.querySelector('#s-tasks-enable').checked;

  if (!enabledViews.length) { alert('At least one view must be enabled.'); return; }
  if (enabledViews.length + (enableTasksView ? 1 : 0) > 5) {
    alert('Maximum 5 navigation tabs allowed. Uncheck a view or disable the tasks tab.');
    return;
  }

  const defaultView   = sheet.querySelector('#s-default').value;
  const timeFormat    = sheet.querySelector('#s-timefmt').value;
  const weekStart     = sheet.querySelector('#s-weekstart').value;
  const defaultCalRaw = sheet.querySelector('#s-defcal').value;
  const tasksCal = sheet.querySelector('#s-tasks-cal').value;
  const tasksCalDAVUrl = tasksCal === '__custom__'
    ? (sheet.querySelector('#s-tasks-url')?.value.trim() || '')
    : tasksCal;
  const showTasksOnCalendar  = sheet.querySelector('#s-tasks-on-cal').checked;
  const taskSortOrder        = sheet.querySelector('#s-tasks-sort').value;

  const payload = {
    enabledViews, defaultView, timeFormat, weekStart,
    enableTasksView, showTasksOnCalendar, taskSortOrder,
  };
  if (defaultCalRaw) payload.defaultCalendar = defaultCalRaw;
  if (tasksCalDAVUrl) payload.tasksCalDAVUrl = tasksCalDAVUrl;

  try {
    const res = await fetch('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    setConfig({ ...payload, defaultCalendar: defaultCalRaw || null });
    closeSettings();
    onChangeCb();
  } catch (err) {
    alert('Could not save settings: ' + err.message);
  }
}
