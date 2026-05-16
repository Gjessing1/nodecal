import { state, setConfig, setTaskSources } from '../app/state.js';
import { esc } from '../app/utils.js';
import { buildTimePicker } from './timePicker.js';
import { renderTaskSourcesSection, renderCategoriesSection } from './settingsHelpers.js';

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

function timeStrToDate(str) {
  const [h, m] = (str || '09:00').split(':').map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m, 0));
}

function renderForm() {
  const sheet = overlay.querySelector('.modal-sheet');
  const cfg = state.config;
  const enabled = cfg.enabledViews || ALL_VIEWS.map(v => v.id);

  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="settings-title-row">
      <div class="modal-title">Settings</div>
      <div class="settings-danger-row">
        <button class="btn btn-ghost" id="s-clear-cache" title="Clear local cache and re-sync from server">Clear cache</button>
        ${cfg.authEnabled ? '<button class="btn btn-ghost" id="s-logout" style="color:var(--color-danger)">Log out</button>' : ''}
      </div>
    </div>

    <div class="modal-row">
      <div class="modal-field">
        <label>Visible views</label>
        ${ALL_VIEWS.map(v => `
          <label class="settings-toggle">
            <input type="checkbox" name="view" value="${v.id}" ${enabled.includes(v.id) ? 'checked' : ''}>
            <span>${v.label}</span>
          </label>`).join('')}
        <label class="settings-toggle">
          <input type="checkbox" id="s-tasks-enable" ${cfg.enableTasksView ? 'checked' : ''}>
          <span>Tasks</span>
        </label>
      </div>
      <div class="modal-field">
        <label>Show tasks on views</label>
        <label class="settings-toggle">
          <input type="checkbox" id="s-tasks-agenda" ${(cfg.showTasksOnAgenda ?? cfg.showTasksOnCalendar) ? 'checked' : ''}>
          <span>Agenda</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="s-tasks-day" ${(cfg.showTasksOnDay ?? cfg.showTasksOnCalendar) ? 'checked' : ''}>
          <span>Day</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="s-tasks-week" ${(cfg.showTasksOnWeek ?? cfg.showTasksOnCalendar) ? 'checked' : ''}>
          <span>Week</span>
        </label>
        <label class="settings-toggle">
          <input type="checkbox" id="s-tasks-month" ${(cfg.showTasksOnMonth ?? cfg.showTasksOnCalendar) ? 'checked' : ''}>
          <span>Month</span>
        </label>
      </div>
    </div>

    <div class="modal-row">
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
    </div>

    <div class="modal-row">
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
          <option value="dmy" ${(cfg.dateFormat || 'dmy') === 'dmy' ? 'selected' : ''}>dd/mm/yyyy</option>
          <option value="mdy" ${cfg.dateFormat === 'mdy' ? 'selected' : ''}>mm/dd/yyyy</option>
          <option value="iso" ${cfg.dateFormat === 'iso' ? 'selected' : ''}>ISO (2025-05-10)</option>
        </select>
      </div>
    </div>

    <div class="modal-field">
      <label>Default calendar for new events</label>
      <select id="s-defcal">
        <option value="">First available</option>
        ${state.calendars.map(c => `<option value="${esc(c.id)}" ${cfg.defaultCalendar === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
    </div>

    <div class="modal-section-label">Notifications</div>

    <div class="modal-field">
      <label class="settings-toggle">
        <input type="checkbox" id="s-notif-enable" ${cfg.enableNotifications ? 'checked' : ''}>
        <span>Enable event reminders (browser notifications)</span>
      </label>
      <div style="display:flex;gap:var(--space-sm);margin-top:var(--space-xs)">
        <span id="s-notif-status" style="font-size:var(--font-size-sm);color:var(--color-text-muted);flex:1"></span>
        <button type="button" id="s-notif-test" class="btn btn-ghost" style="font-size:var(--font-size-sm);padding:2px 12px">Test notification</button>
      </div>
    </div>
    <div class="modal-row">
      <div class="modal-field">
        <label>Default event reminder</label>
        <select id="s-alarm-default">
          <option value="0"  ${(cfg.alarmDefaultMinutes ?? 0) === 0    ? 'selected' : ''}>None</option>
          <option value="5"  ${cfg.alarmDefaultMinutes === 5    ? 'selected' : ''}>5 min before</option>
          <option value="10" ${cfg.alarmDefaultMinutes === 10   ? 'selected' : ''}>10 min before</option>
          <option value="15" ${cfg.alarmDefaultMinutes === 15   ? 'selected' : ''}>15 min before</option>
          <option value="30" ${cfg.alarmDefaultMinutes === 30   ? 'selected' : ''}>30 min before</option>
          <option value="60" ${cfg.alarmDefaultMinutes === 60   ? 'selected' : ''}>1 hour before</option>
        </select>
      </div>
      <div class="modal-field">
        <label>Default task reminder</label>
        <select id="s-task-reminder-default">
          <option value="none"           ${!cfg.taskReminderDefault || cfg.taskReminderDefault === 'none' ? 'selected' : ''}>None</option>
          <option value="on-due"         ${cfg.taskReminderDefault === 'on-due'          ? 'selected' : ''}>Morning on due date</option>
          <option value="evening-due"    ${cfg.taskReminderDefault === 'evening-due'     ? 'selected' : ''}>Evening on due date</option>
          <option value="morning-before" ${cfg.taskReminderDefault === 'morning-before'  ? 'selected' : ''}>Morning day before</option>
          <option value="evening-before" ${cfg.taskReminderDefault === 'evening-before'  ? 'selected' : ''}>Evening day before</option>
        </select>
      </div>
    </div>
    <div class="modal-row">
      <div class="modal-field">
        <label>Morning time</label>
        <div id="s-morning-pick-wrap"></div>
      </div>
      <div class="modal-field">
        <label>Evening time</label>
        <div id="s-evening-pick-wrap"></div>
      </div>
    </div>

    <div class="modal-section-label">Sync</div>

    <div class="modal-row">
      <div class="modal-field">
        <label>Auto-sync interval (minutes)</label>
        <input type="number" id="s-sync-interval" value="${cfg.syncIntervalMinutes ?? 2}" min="1" max="60" step="1">
      </div>
      <div class="modal-field">
        <label>Agenda days to show</label>
        <input type="number" id="s-agenda-days" value="${cfg.agendaDays ?? 90}" min="7" max="365" step="7">
      </div>
    </div>
    <div class="modal-row">
      <div class="modal-field">
        <label>Events history (days)</label>
        <input type="number" id="s-sync-history" value="${cfg.syncHistoryDays ?? 730}" min="30">
      </div>
      <div class="modal-field">
        <label>Events future (days, 0=all)</label>
        <input type="number" id="s-sync-future" value="${cfg.syncFutureDays ?? 0}" min="0">
      </div>
    </div>

    <div class="modal-section-label">Events</div>

    <div class="modal-row">
      <div class="modal-field">
        <label>Default time (future dates)</label>
        <div id="s-default-event-time-wrap"></div>
      </div>
      <div class="modal-field">
        <label>Default duration (minutes)</label>
        <input type="number" id="s-default-event-dur" value="${cfg.defaultEventDuration || 60}" min="15" max="480" step="15">
      </div>
    </div>

    <div class="modal-field">
      <label>Show week numbers (ISO 8601)</label>
      <label class="settings-toggle">
        <input type="checkbox" id="s-weeknums-day" ${(cfg.showWeekNumbersDay ?? cfg.showWeekNumbers) ? 'checked' : ''}>
        <span>Day view</span>
      </label>
      <label class="settings-toggle">
        <input type="checkbox" id="s-weeknums-month" ${(cfg.showWeekNumbersMonth ?? cfg.showWeekNumbers) ? 'checked' : ''}>
        <span>Month view</span>
      </label>
      <label class="settings-toggle">
        <input type="checkbox" id="s-weeknums-agenda" ${(cfg.showWeekNumbersAgenda ?? cfg.showWeekNumbers) ? 'checked' : ''}>
        <span>Agenda view</span>
      </label>
      <label class="settings-toggle">
        <input type="checkbox" id="s-weekend-bg" ${cfg.showWeekendBg !== false ? 'checked' : ''}>
        <span>Highlight weekends</span>
      </label>
    </div>

    <div class="modal-section-label">Tasks</div>

    <div id="s-task-sources-section"></div>

    <div class="modal-row">
      <div class="modal-field">
        <label>Default task sort</label>
        <select id="s-tasks-sort">
          <option value="due"     ${cfg.taskSortOrder === 'due'     ? 'selected' : ''}>Due date</option>
          <option value="starred" ${cfg.taskSortOrder === 'starred' ? 'selected' : ''}>Starred first</option>
          <option value="alpha"   ${cfg.taskSortOrder === 'alpha'   ? 'selected' : ''}>Alphabetical</option>
          <option value="created" ${cfg.taskSortOrder === 'created' ? 'selected' : ''}>Creation date</option>
        </select>
      </div>
    </div>

    <div id="s-categories-section"></div>

    <div class="modal-section-label">Weather</div>
    <div class="modal-field">
      <label>Location for weather (met.no)</label>
      <div style="display:flex;gap:var(--space-sm);align-items:flex-end">
        <div style="flex:0 0 auto">
          <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:3px">Latitude</div>
          <input type="text" id="s-weather-lat" value="${esc(cfg.weatherLat || '')}" placeholder="59.91" style="width:80px">
        </div>
        <div style="flex:0 0 auto">
          <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:3px">Longitude</div>
          <input type="text" id="s-weather-lon" value="${esc(cfg.weatherLon || '')}" placeholder="10.75" style="width:80px">
        </div>
        <button type="button" id="s-weather-detect" class="btn btn-ghost" style="font-size:var(--font-size-sm);flex-shrink:0;white-space:nowrap;padding:8px 10px">📍 Detect</button>
      </div>
    </div>
    <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-md)">
      <div style="display:flex;flex-direction:column;gap:var(--space-xs)">
        <label style="font-size:var(--font-size-sm);color:var(--color-text-muted);font-weight:500">Week (days)</label>
        <input type="number" id="s-weather-days-week" value="${cfg.weatherDaysWeek ?? 9}" min="1" max="14" step="1" style="width:70px">
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-xs)">
        <label style="font-size:var(--font-size-sm);color:var(--color-text-muted);font-weight:500">Month (days)</label>
        <input type="number" id="s-weather-days-month" value="${cfg.weatherDaysMonth ?? 4}" min="1" max="14" step="1" style="width:70px">
      </div>
      <div style="display:flex;flex-direction:column;gap:var(--space-xs)">
        <label style="font-size:var(--font-size-sm);color:var(--color-text-muted);font-weight:500">Agenda (days)</label>
        <input type="number" id="s-weather-days-agenda" value="${cfg.weatherDaysAgenda ?? 1}" min="1" max="9" step="1" style="width:70px">
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-primary" id="s-save">Save</button>
      <button class="btn btn-ghost" id="s-cancel">Cancel</button>
    </div>
  `;

  // ── Time pickers (replace native <input type="time">) ──────────────────────
  sheet.querySelector('#s-morning-pick-wrap').appendChild(
    buildTimePicker('s-task-reminder-morning', timeStrToDate(cfg.taskReminderMorningTime || '09:00'), 'UTC')
  );
  sheet.querySelector('#s-evening-pick-wrap').appendChild(
    buildTimePicker('s-task-reminder-evening', timeStrToDate(cfg.taskReminderEveningTime || '18:00'), 'UTC')
  );
  sheet.querySelector('#s-default-event-time-wrap').appendChild(
    buildTimePicker('s-default-event-time', timeStrToDate(cfg.defaultEventTime || '09:00'), 'UTC')
  );

  // ── Notification permission + status + test ────────────────────────────────
  const notifCheck  = sheet.querySelector('#s-notif-enable');
  const notifStatus = sheet.querySelector('#s-notif-status');
  const notifTest   = sheet.querySelector('#s-notif-test');

  function updateNotifStatus() {
    if (!notifStatus) return;
    if (!('Notification' in window)) {
      notifStatus.textContent = 'Not supported by this browser';
    } else {
      const perm = Notification.permission;
      notifStatus.textContent = perm === 'granted' ? '✓ Permission granted'
        : perm === 'denied' ? '✗ Permission denied — enable in browser settings'
        : 'Permission not yet requested';
      notifStatus.style.color = perm === 'granted' ? 'var(--color-accent)'
        : perm === 'denied' ? 'var(--color-danger)' : 'var(--color-text-muted)';
    }
  }
  updateNotifStatus();

  if (notifCheck) {
    notifCheck.addEventListener('change', async () => {
      if (!notifCheck.checked) return;
      if (!('Notification' in window)) { notifCheck.checked = false; alert('Notifications not supported by this browser'); return; }
      if (Notification.permission === 'denied') { notifCheck.checked = false; alert('Permission denied — please enable in browser/OS settings.'); return; }
      if (Notification.permission === 'default') {
        const r = await Notification.requestPermission();
        if (r !== 'granted') { notifCheck.checked = false; }
      }
      updateNotifStatus();
    });
  }

  if (notifTest) {
    notifTest.addEventListener('click', async () => {
      if (!('Notification' in window)) { alert('Not supported'); return; }
      if (Notification.permission !== 'granted') {
        const r = await Notification.requestPermission();
        updateNotifStatus();
        if (r !== 'granted') return;
      }
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          await reg.showNotification('Nodecal test', { body: 'Notifications are working! ✓', icon: '/icons/icon.svg' });
          return;
        } catch { /* fall through */ }
      }
      new Notification('Nodecal test', { body: 'Notifications are working! ✓', icon: '/icons/icon.svg' });
    });
  }

  // ── Dynamic sections ───────────────────────────────────────────────────────
  renderTaskSourcesSection(sheet, cfg);
  renderCategoriesSection(sheet, cfg);

  // ── Weather detect ────────────────────────────────────────────────────────
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
  sheet.querySelector('#s-clear-cache').addEventListener('click', async () => {
    const btn = sheet.querySelector('#s-clear-cache');
    btn.textContent = '↻ Syncing…';
    btn.disabled = true;
    try {
      const res = await fetch('/sync/clear', { method: 'POST' });
      const data = await res.json();
      if (data.ok) { closeSettings(); onChangeCb(); }
      else { alert('Clear failed: ' + data.error); }
    } catch (err) {
      alert('Clear failed: ' + err.message);
    } finally {
      btn.textContent = 'Clear cache';
      btn.disabled = false;
    }
  });
  if (cfg.authEnabled) {
    sheet.querySelector('#s-logout').addEventListener('click', handleLogout);
  }
}

async function handleLogout() {
  await fetch('/logout', { method: 'POST' });
  window.location.reload();
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
  const showTasksOnDay    = sheet.querySelector('#s-tasks-day').checked;
  const showTasksOnWeek   = sheet.querySelector('#s-tasks-week').checked;
  const showTasksOnMonth  = sheet.querySelector('#s-tasks-month').checked;
  const showTasksOnAgenda = sheet.querySelector('#s-tasks-agenda').checked;
  const showTasksOnCalendar = showTasksOnDay || showTasksOnWeek || showTasksOnMonth || showTasksOnAgenda;
  const taskSortOrder        = sheet.querySelector('#s-tasks-sort').value;
  const defaultEventTime     = sheet.querySelector('#s-default-event-time').value || '09:00';
  const defaultEventDuration = parseInt(sheet.querySelector('#s-default-event-dur').value) || 60;
  const showWeekNumbersDay   = sheet.querySelector('#s-weeknums-day').checked;
  const showWeekNumbersMonth = sheet.querySelector('#s-weeknums-month').checked;
  const showWeekNumbersAgenda= sheet.querySelector('#s-weeknums-agenda').checked;
  const showWeekNumbers      = showWeekNumbersDay || showWeekNumbersMonth || showWeekNumbersAgenda;
  const enableNotifications       = sheet.querySelector('#s-notif-enable').checked;
  const alarmDefaultMinutes       = parseInt(sheet.querySelector('#s-alarm-default').value) || 0;
  const taskReminderDefault       = sheet.querySelector('#s-task-reminder-default').value || 'none';
  const taskReminderMorningTime   = sheet.querySelector('#s-task-reminder-morning').value || '09:00';
  const taskReminderEveningTime   = sheet.querySelector('#s-task-reminder-evening').value || '18:00';
  const agendaDays           = parseInt(sheet.querySelector('#s-agenda-days').value) || 90;
  const syncIntervalMinutes  = parseInt(sheet.querySelector('#s-sync-interval').value) || 2;
  const syncHistoryDays      = Math.max(30, parseInt(sheet.querySelector('#s-sync-history').value) || 730);
  const syncFutureDays       = Math.max(0, parseInt(sheet.querySelector('#s-sync-future').value) || 0);
  const dateFormat           = sheet.querySelector('#s-datefmt').value;
  const weatherLat           = sheet.querySelector('#s-weather-lat').value.trim();
  const weatherLon           = sheet.querySelector('#s-weather-lon').value.trim();
  const weatherDaysWeek      = parseInt(sheet.querySelector('#s-weather-days-week').value) || 9;
  const weatherDaysMonth     = parseInt(sheet.querySelector('#s-weather-days-month').value) || 4;
  const weatherDaysAgenda    = parseInt(sheet.querySelector('#s-weather-days-agenda').value) || 1;
  const showWeekendBg        = sheet.querySelector('#s-weekend-bg').checked;

  const payload = {
    enabledViews, defaultView, timeFormat, weekStart,
    enableTasksView, showTasksOnCalendar, taskSortOrder,
    showTasksOnDay, showTasksOnWeek, showTasksOnMonth, showTasksOnAgenda,
    hiddenCategories:      state.config.hiddenCategories || [],
    hiddenEventCategories: state.config.hiddenEventCategories || [],
    taskSources: state.taskSources || [],
    defaultTaskSource: state.config.defaultTaskSource || '',
    enableNotifications, alarmDefaultMinutes, taskReminderDefault, taskReminderMorningTime, taskReminderEveningTime,
    agendaDays, syncIntervalMinutes, defaultEventTime, defaultEventDuration, showWeekNumbers,
    showWeekNumbersDay, showWeekNumbersMonth, showWeekNumbersAgenda,
    syncHistoryDays, syncFutureDays, dateFormat,
    weatherLat, weatherLon, weatherDaysWeek, weatherDaysMonth, weatherDaysAgenda, showWeekendBg,
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
