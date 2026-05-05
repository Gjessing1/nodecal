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

    <div class="modal-actions">
      <button class="btn btn-primary" id="s-save">Save</button>
      <button class="btn btn-ghost" id="s-cancel">Cancel</button>
    </div>
  `;

  sheet.querySelector('#s-save').addEventListener('click', handleSave);
  sheet.querySelector('#s-cancel').addEventListener('click', closeSettings);
}

async function handleSave() {
  const sheet = overlay.querySelector('.modal-sheet');
  const enabledViews = Array.from(sheet.querySelectorAll('input[name="view"]:checked')).map(c => c.value);
  if (!enabledViews.length) { alert('At least one view must be enabled.'); return; }

  const defaultView = sheet.querySelector('#s-default').value;
  const timeFormat  = sheet.querySelector('#s-timefmt').value;
  const weekStart   = sheet.querySelector('#s-weekstart').value;
  const payload = { enabledViews, defaultView, timeFormat, weekStart };

  try {
    const res = await fetch('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    setConfig(payload);
    closeSettings();
    onChangeCb();
  } catch (err) {
    alert('Could not save settings: ' + err.message);
  }
}
