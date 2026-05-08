import { state, setConfig, setTaskSources } from '../app/state.js';
import { getAllCategories } from '../app/taskUtils.js';

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

    <div id="s-task-sources-section"></div>

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
        <option value="starred" ${cfg.taskSortOrder === 'starred' ? 'selected' : ''}>Starred first</option>
        <option value="alpha"   ${cfg.taskSortOrder === 'alpha'   ? 'selected' : ''}>Alphabetical</option>
        <option value="created" ${cfg.taskSortOrder === 'created' ? 'selected' : ''}>Creation date</option>
      </select>
    </div>

    <div id="s-categories-section"></div>

    <div class="modal-actions">
      <button class="btn btn-primary" id="s-save">Save</button>
      <button class="btn btn-ghost" id="s-cancel">Cancel</button>
      ${cfg.authEnabled ? '<button class="btn btn-ghost" id="s-logout" style="color:var(--color-danger)">Log out</button>' : ''}
    </div>
  `;

  // Task sources section (replaces single tasksCalDAVUrl)
  renderTaskSourcesSection(sheet, cfg);

  // Categories section — show all categories with hide/unhide controls
  renderCategoriesSection(sheet, cfg);

  sheet.querySelector('#s-save').addEventListener('click', handleSave);
  sheet.querySelector('#s-cancel').addEventListener('click', closeSettings);
  if (cfg.authEnabled) {
    sheet.querySelector('#s-logout').addEventListener('click', handleLogout);
  }
}

function renderTaskSourcesSection(sheet, cfg) {
  const section = sheet.querySelector('#s-task-sources-section');
  const sources = [...(state.taskSources || [])];
  const defUrl  = cfg.defaultTaskSource || sources[0]?.url || '';

  section.innerHTML = '';

  const addRow = (src, idx) => {
    const row = document.createElement('div');
    row.className = 'modal-field';
    row.style.cssText = 'gap:6px;margin-bottom:8px';

    const urlRow = document.createElement('div');
    urlRow.style.cssText = 'display:flex;gap:6px;align-items:center';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'task-src-default';
    radio.value = src.url;
    radio.checked = src.url === defUrl || (!defUrl && idx === 0);
    radio.title = 'Set as default source';
    radio.addEventListener('change', () => {
      state.config.defaultTaskSource = src.url;
    });

    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.value = src.url;
    urlInput.placeholder = 'https://…/user/tasks/';
    urlInput.style.flex = '1';
    urlInput.addEventListener('change', () => { sources[idx].url = urlInput.value.trim(); });

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = src.name || '';
    nameInput.placeholder = 'Name (optional)';
    nameInput.style.cssText = 'width:100px;flex-shrink:0';
    nameInput.addEventListener('input', () => { sources[idx].name = nameInput.value.trim() || src.url; });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-ghost';
    removeBtn.style.cssText = 'padding:4px 8px;font-size:var(--font-size-sm);color:var(--color-danger);flex-shrink:0';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      sources.splice(idx, 1);
      state.taskSources = [...sources];
      renderTaskSourcesSection(sheet, { ...cfg, defaultTaskSource: state.config.defaultTaskSource });
    });

    urlRow.appendChild(radio);
    urlRow.appendChild(urlInput);
    urlRow.appendChild(nameInput);
    urlRow.appendChild(removeBtn);
    row.appendChild(urlRow);
    section.appendChild(row);
  };

  if (sources.length) {
    const label = document.createElement('div');
    label.className = 'modal-field';
    label.innerHTML = '<label style="margin-bottom:4px">Task sources <span style="font-weight:normal;font-size:11px">(● = default for new tasks)</span></label>';
    section.appendChild(label);
    sources.forEach((src, i) => addRow(src, i));
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-ghost';
  addBtn.style.cssText = 'font-size:var(--font-size-sm);padding:4px 12px;margin-bottom:var(--space-md)';
  addBtn.textContent = '+ Add task source';
  addBtn.addEventListener('click', () => {
    sources.push({ url: '', name: '' });
    state.taskSources = [...sources];
    renderTaskSourcesSection(sheet, cfg);
  });
  section.appendChild(addBtn);

  // Persist sources to state so handleSave picks them up
  state.taskSources = [...sources];
}

function renderCategoriesSection(sheet, cfg) {
  const allCats = getAllCategories(state.tasks);
  const section = sheet.querySelector('#s-categories-section');
  if (!allCats.length) { section.innerHTML = ''; return; }

  const hidden = cfg.hiddenCategories || [];
  section.innerHTML = `<div class="modal-section-label">Categories</div>`;

  const list = document.createElement('div');
  list.className = 'modal-field';
  list.style.gap = '6px';

  for (const cat of allCats) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 0';

    const name = document.createElement('span');
    name.className = 'task-cat-chip';
    name.textContent = cat;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost';
    btn.style.cssText = 'padding:2px 10px;font-size:var(--font-size-sm)';
    const isHidden = hidden.includes(cat);
    btn.textContent = isHidden ? 'Unhide' : 'Hide';
    btn.style.color = isHidden ? 'var(--color-accent)' : 'var(--color-text-muted)';

    btn.addEventListener('click', async () => {
      const current = state.config.hiddenCategories || [];
      const next = isHidden
        ? current.filter(c => c !== cat)
        : [...current, cat];
      try {
        const res = await fetch('/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hiddenCategories: next }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        setConfig({ hiddenCategories: next });
        renderCategoriesSection(sheet, { ...cfg, hiddenCategories: next });
      } catch (err) {
        alert('Could not update: ' + err.message);
      }
    });

    row.appendChild(name);
    row.appendChild(btn);
    list.appendChild(row);
  }
  section.appendChild(list);
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
  const defaultCalRaw        = sheet.querySelector('#s-defcal').value;
  const showTasksOnCalendar  = sheet.querySelector('#s-tasks-on-cal').checked;
  const taskSortOrder        = sheet.querySelector('#s-tasks-sort').value;

  const payload = {
    enabledViews, defaultView, timeFormat, weekStart,
    enableTasksView, showTasksOnCalendar, taskSortOrder,
    hiddenCategories: state.config.hiddenCategories || [],
    taskSources: state.taskSources || [],
    defaultTaskSource: state.config.defaultTaskSource || '',
  };
  if (defaultCalRaw) payload.defaultCalendar = defaultCalRaw;

  try {
    const res = await fetch('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    setConfig({ ...payload, defaultCalendar: defaultCalRaw || null });
    if (payload.taskSources) setTaskSources(payload.taskSources);
    closeSettings();
    onChangeCb();
  } catch (err) {
    alert('Could not save settings: ' + err.message);
  }
}
