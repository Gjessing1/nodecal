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
      <label>Date format</label>
      <select id="s-datefmt">
        <option value="dmy" ${(cfg.dateFormat || 'dmy') === 'dmy' ? 'selected' : ''}>dd/mm/yyyy (10 May 2025)</option>
        <option value="mdy" ${cfg.dateFormat === 'mdy' ? 'selected' : ''}>mm/dd/yyyy (May 10, 2025)</option>
        <option value="iso" ${cfg.dateFormat === 'iso' ? 'selected' : ''}>ISO (2025-05-10)</option>
      </select>
    </div>

    <div class="modal-field">
      <label>Default calendar for new events</label>
      <select id="s-defcal">
        <option value="">First available</option>
        ${state.calendars.map(c => `<option value="${esc(c.id)}" ${cfg.defaultCalendar === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>

    <div class="modal-section-label">Events</div>

    <div class="modal-field">
      <label>Default event time (future dates)</label>
      <input type="time" id="s-default-event-time" value="${cfg.defaultEventTime || '09:00'}">
    </div>

    <div class="modal-field">
      <label>Default event duration (minutes)</label>
      <input type="number" id="s-default-event-dur" value="${cfg.defaultEventDuration || 60}" min="15" max="480" step="15">
    </div>

    <div class="modal-field">
      <label class="settings-toggle">
        <input type="checkbox" id="s-weeknums" ${cfg.showWeekNumbers ? 'checked' : ''}>
        <span>Show week numbers (ISO 8601)</span>
      </label>
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
      <label>Default task sort order</label>
      <select id="s-tasks-sort">
        <option value="due"     ${cfg.taskSortOrder === 'due'     ? 'selected' : ''}>Due date</option>
        <option value="starred" ${cfg.taskSortOrder === 'starred' ? 'selected' : ''}>Starred first</option>
        <option value="alpha"   ${cfg.taskSortOrder === 'alpha'   ? 'selected' : ''}>Alphabetical</option>
        <option value="created" ${cfg.taskSortOrder === 'created' ? 'selected' : ''}>Creation date</option>
      </select>
    </div>

    <div id="s-categories-section"></div>

    <div class="modal-section-label">Weather</div>
    <div class="modal-field">
      <label>Location for weather (met.no)</label>
      <div style="display:flex;gap:var(--space-sm)">
        <input type="text" id="s-weather-lat" value="${esc(cfg.weatherLat || '')}" placeholder="Latitude e.g. 59.91" style="flex:1">
        <input type="text" id="s-weather-lon" value="${esc(cfg.weatherLon || '')}" placeholder="Longitude e.g. 10.75" style="flex:1">
      </div>
      <button type="button" id="s-weather-detect" class="btn btn-ghost" style="margin-top:var(--space-xs);font-size:var(--font-size-sm)">📍 Detect my location</button>
    </div>
    <div class="modal-field">
      <label>Show weather for (days ahead)</label>
      <input type="number" id="s-weather-days" value="${cfg.weatherDays ?? 6}" min="1" max="14" step="1">
    </div>

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

  // Weather location detect button
  const detectBtn = sheet.querySelector('#s-weather-detect');
  if (detectBtn) {
    detectBtn.addEventListener('click', () => {
      if (!navigator.geolocation) { alert('Geolocation not supported by your browser'); return; }
      detectBtn.textContent = '⏳ Detecting…';
      navigator.geolocation.getCurrentPosition(pos => {
        sheet.querySelector('#s-weather-lat').value = pos.coords.latitude.toFixed(4);
        sheet.querySelector('#s-weather-lon').value = pos.coords.longitude.toFixed(4);
        detectBtn.textContent = '✓ Location detected';
      }, () => {
        detectBtn.textContent = '📍 Detect my location';
        alert('Location permission denied');
      });
    });
  }

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

  const headerLabel = document.createElement('div');
  headerLabel.className = 'modal-field';
  headerLabel.innerHTML = '<label>Task sources <span style="font-weight:normal;font-size:11px;color:var(--color-text-muted)">(select which calendar collection stores tasks)</span></label>';
  section.appendChild(headerLabel);

  // Build calendar options list — available CalDAV calendars + custom URL option
  const calOptions = state.calendars.map(c => ({ value: c.id, label: c.name }));
  const CUSTOM = '__custom__';

  const addRow = (src, idx) => {
    const isCustom = !calOptions.find(o => o.value === src.url);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:flex-start;margin-bottom:8px';

    // Default radio
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'task-src-default';
    radio.value = src.url || `__new__${idx}`;
    radio.checked = !!src.url && (src.url === defUrl || (!defUrl && idx === 0));
    radio.title = 'Default source for new tasks';
    radio.style.marginTop = '10px';
    radio.addEventListener('change', () => { state.config.defaultTaskSource = src.url; });

    // Calendar dropdown
    const sel = document.createElement('select');
    sel.style.flex = '1';
    sel.innerHTML = calOptions.map(o =>
      `<option value="${esc(o.value)}" ${src.url === o.value ? 'selected' : ''}>${esc(o.label)}</option>`
    ).join('') + `<option value="${CUSTOM}" ${isCustom ? 'selected' : ''}>Custom URL…</option>`;

    // Custom URL input (shown only when "Custom URL" selected)
    const customInput = document.createElement('input');
    customInput.type = 'url';
    customInput.placeholder = 'https://…/user/tasks/';
    customInput.style.cssText = 'flex:1;display:' + (isCustom ? 'block' : 'none');
    customInput.value = isCustom ? src.url : '';

    const colWrap = document.createElement('div');
    colWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:4px';
    colWrap.appendChild(sel);
    colWrap.appendChild(customInput);

    sel.addEventListener('change', () => {
      const val = sel.value;
      if (val === CUSTOM) {
        customInput.style.display = 'block';
        sources[idx].url = customInput.value.trim();
        sources[idx].name = 'Custom';
      } else {
        customInput.style.display = 'none';
        sources[idx].url = val;
        sources[idx].name = calOptions.find(o => o.value === val)?.label || '';
        radio.value = val;
        if (radio.checked) state.config.defaultTaskSource = val;
      }
    });
    customInput.addEventListener('input', () => {
      sources[idx].url = customInput.value.trim();
      radio.value = sources[idx].url;
      if (radio.checked) state.config.defaultTaskSource = sources[idx].url;
    });

    // Pre-fill name from calendar list if not custom
    if (!isCustom && !src.name) {
      sources[idx].name = calOptions.find(o => o.value === src.url)?.label || src.url;
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-ghost';
    removeBtn.style.cssText = 'padding:4px 8px;font-size:var(--font-size-sm);color:var(--color-danger);flex-shrink:0;margin-top:2px';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      sources.splice(idx, 1);
      state.taskSources = [...sources];
      renderTaskSourcesSection(sheet, { ...cfg, defaultTaskSource: state.config.defaultTaskSource });
    });

    row.appendChild(radio);
    row.appendChild(colWrap);
    row.appendChild(removeBtn);
    section.appendChild(row);
  };

  sources.forEach((src, i) => addRow(src, i));

  // If no sources configured, auto-show one row with the first calendar pre-selected
  if (!sources.length && calOptions.length) {
    const firstCal = calOptions[0];
    sources.push({ url: firstCal.value, name: firstCal.label });
    state.taskSources = [...sources];
    addRow(sources[0], 0);
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-ghost';
  addBtn.style.cssText = 'font-size:var(--font-size-sm);padding:4px 12px;margin-bottom:var(--space-md)';
  addBtn.textContent = '+ Add task source';
  addBtn.addEventListener('click', () => {
    const firstCal = calOptions[0];
    sources.push({ url: firstCal?.value || '', name: firstCal?.label || '' });
    state.taskSources = [...sources];
    renderTaskSourcesSection(sheet, cfg);
  });
  section.appendChild(addBtn);

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
  const defaultEventTime     = sheet.querySelector('#s-default-event-time').value || '09:00';
  const defaultEventDuration = parseInt(sheet.querySelector('#s-default-event-dur').value) || 60;
  const showWeekNumbers      = sheet.querySelector('#s-weeknums').checked;
  const dateFormat           = sheet.querySelector('#s-datefmt').value;
  const weatherLat           = sheet.querySelector('#s-weather-lat').value.trim();
  const weatherLon           = sheet.querySelector('#s-weather-lon').value.trim();
  const weatherDays          = parseInt(sheet.querySelector('#s-weather-days').value) || 6;

  const payload = {
    enabledViews, defaultView, timeFormat, weekStart,
    enableTasksView, showTasksOnCalendar, taskSortOrder,
    hiddenCategories: state.config.hiddenCategories || [],
    taskSources: state.taskSources || [],
    defaultTaskSource: state.config.defaultTaskSource || '',
    defaultEventTime, defaultEventDuration, showWeekNumbers, dateFormat,
    weatherLat, weatherLon, weatherDays,
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
