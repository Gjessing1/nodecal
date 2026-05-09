import { state, setCalendars, setEvents, setTasks, setTaskSources, setWeather, setConfig } from './state.js';
import { renderAgenda } from '../views/agenda.js';
import { renderDay, destroyDay } from '../views/day.js';
import { renderWeek, destroyWeek } from '../views/week.js';
import { renderMonth } from '../views/month.js';
import { renderTasks, focusTaskQuickAdd, openTaskModal } from '../views/tasks.js';
import { initModal, openNewEventModal, openEditEventModal } from '../components/modalEditor.js';
import { initCalendarDrawer, openDrawer } from '../components/calendarDrawer.js';
import { initSettingsPanel, openSettings } from '../components/settingsPanel.js';
import { initInstallPrompt } from './installPrompt.js';
import { initTheme } from './theme.js';

const viewContainer   = document.getElementById('view-container');
const syncBtn         = document.getElementById('sync-btn');
const syncError       = document.getElementById('sync-error');
const fab             = document.getElementById('fab');
const calBtn          = document.getElementById('cal-btn');
const settingsBtn     = document.getElementById('settings-btn');
const bottomNav       = document.getElementById('bottom-nav');
const calQuickAdd      = document.getElementById('cal-quickadd');
const calQuickAddInput = document.getElementById('cal-quickadd-input');
const searchOverlay    = document.getElementById('search-overlay');
const searchInput      = document.getElementById('search-input');
const searchResults    = document.getElementById('search-results');

const VIEW_META = {
  agenda: { icon: '≡', label: 'Agenda' },
  day:    { icon: '▭', label: 'Day' },
  week:   { icon: '⊞', label: 'Week' },
  month:  { icon: '⊟', label: 'Month' },
  tasks:  { icon: '✓', label: 'Tasks' },
};

// ── Navigation ────────────────────────────────────────────

function buildNav() {
  bottomNav.innerHTML = '';
  const calViews = state.config.enabledViews || ['agenda'];
  const tabs = [...calViews];
  if (state.config.enableTasksView) tabs.push('tasks');

  for (const viewId of tabs) {
    const meta = VIEW_META[viewId];
    if (!meta) continue;
    const btn = document.createElement('button');
    btn.className = 'nav-btn' + (state.activeView === viewId ? ' active' : '');
    btn.dataset.view = viewId;
    btn.innerHTML = `<span class="nav-icon">${meta.icon}</span><span>${meta.label}</span>`;
    btn.addEventListener('click', () => switchView(viewId));
    bottomNav.appendChild(btn);
  }
}

function switchView(viewName) {
  const calViews = state.config.enabledViews || ['agenda'];
  const tabs = [...calViews];
  if (state.config.enableTasksView) tabs.push('tasks');
  if (!tabs.includes(viewName)) return;
  if (viewName === 'day' && state.activeView === 'day') {
    state.selectedDate = new Date();
  }
  state.activeView = viewName;
  buildNav();
  render();
}

// ── View rendering ────────────────────────────────────────

const viewCallbacks = {
  onEventClick:  handleEventClick,
  onEventMove:   handleEventMove,
  onEventResize: handleEventResize,
  onTaskClick:   handleTaskEdit,
  onLongPress:   handleLongPressCreate,
};

const taskCallbacks = {
  onComplete: handleTaskComplete,
  onStar:     handleTaskStar,
  onAdd:      handleTaskAdd,
  onEdit:     handleTaskEdit,
  onDelete:   handleTaskDelete,
  onSnooze:   handleTaskSnooze,
};

function render() {
  destroyDay();
  destroyWeek();
  // Show/hide calendar quick-add bar (not shown in tasks view which has its own)
  const showQuickAdd = state.activeView !== 'tasks';
  calQuickAdd.classList.toggle('hidden', !showQuickAdd);
  document.getElementById('app').classList.toggle('cal-quickadd-visible', showQuickAdd);
  // FAB is hidden in tasks view — tasks view has its own + and ↵ buttons
  fab.hidden = state.activeView === 'tasks';
  if      (state.activeView === 'tasks') renderTasks(viewContainer, taskCallbacks);
  else if (state.activeView === 'day')   renderDay(viewContainer, viewCallbacks);
  else if (state.activeView === 'week')  renderWeek(viewContainer, viewCallbacks);
  else if (state.activeView === 'month') renderMonth(viewContainer, handleEventClick, handleDayClick, handleEventMove, () => switchView('tasks'), handleLongPressCreate, handleTaskComplete, handleTaskEdit, handleNewTaskForDay);
  else                                   renderAgenda(viewContainer, handleEventClick, handleTaskEdit, handleTaskComplete, handleLongPressCreate);
}

function handleDayClick(date) {
  state.selectedDate = date;
  const enabled = state.config.enabledViews || ['day'];
  const target = ['day', 'week', 'agenda'].find(v => enabled.includes(v)) || enabled[0];
  switchView(target);
}

// ── Data loading ──────────────────────────────────────────

function rangeFrom() {
  const days = state.config.syncHistoryDays ?? 730;
  return new Date(Date.now() - days * 86400000).toISOString();
}
function rangeTo() {
  const days = state.config.syncFutureDays || 0;
  return new Date(Date.now() + (days || 3650) * 86400000).toISOString(); // 0 = all = 10 years
}

async function loadAll() {
  const fetches = [
    fetch('/settings'),
    fetch('/calendars'),
    fetch(`/events?from=${rangeFrom()}&to=${rangeTo()}`),
    fetch('/tasks'),
    fetch('/task-sources'),
  ];
  const [settingsRes, calRes, evRes, tasksRes, sourcesRes] = await Promise.all(fetches);
  if (settingsRes.status === 401) { showLogin(); return false; }

  const settings = await settingsRes.json();
  setConfig(settings);
  setCalendars(await calRes.json());
  setEvents(await evRes.json());
  if (tasksRes.ok) setTasks(await tasksRes.json());
  if (sourcesRes.ok) setTaskSources(await sourcesRes.json());

  if (!state._viewInitialized) {
    const calViews = settings.enabledViews || ['agenda'];
    const def = settings.defaultView || calViews[0];
    state.activeView = calViews.includes(def) ? def : calViews[0];
    state._viewInitialized = true;
  }
  return true;
}

async function loadEvents() {
  const res = await fetch(`/events?from=${rangeFrom()}&to=${rangeTo()}`);
  const events = await res.json();
  setEvents(events);
  scheduleNotifications(events);
}

// ── Notifications ─────────────────────────────────────────

const _notifTimers = [];

function taskAlarmDatetime(dueStr, reminderType, cfg) {
  if (!dueStr || !reminderType || reminderType === 'none') return null;
  const tz = cfg.timezone || 'UTC';
  const morningTime = cfg.taskReminderMorningTime || '09:00';
  const eveningTime = cfg.taskReminderEveningTime || '18:00';
  let dateStr = dueStr, timeStr = morningTime;
  if (reminderType === 'evening-before') {
    const d = new Date(dueStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1);
    dateStr = d.toISOString().slice(0, 10); timeStr = eveningTime;
  } else if (reminderType === 'morning-before') {
    const d = new Date(dueStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1);
    dateStr = d.toISOString().slice(0, 10);
  }
  const [h, m] = timeStr.split(':').map(Number);
  const naive = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`);
  const parts = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false,
  }).formatToParts(naive)) parts[p.type] = p.value;
  const hh = parts.hour === '24' ? '00' : parts.hour;
  const shownAsUtc = new Date(`${parts.year}-${parts.month}-${parts.day}T${hh}:${parts.minute}:${parts.second}Z`);
  return new Date(naive.getTime() + (naive.getTime() - shownAsUtc.getTime()));
}

function scheduleNotifications(events) {
  while (_notifTimers.length) clearTimeout(_notifTimers.pop());
  if (!state.config.enableNotifications) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = Date.now();

  // Event alarms
  for (const ev of (events || state.events)) {
    if (!ev.alarmMinutes || ev.allDay) continue;
    const alarmAt = new Date(ev.start).getTime() - ev.alarmMinutes * 60000;
    const delay = alarmAt - now;
    if (delay > 0 && delay < 48 * 60 * 60 * 1000) {
      _notifTimers.push(setTimeout(() => {
        const timeStr = new Date(ev.start).toLocaleTimeString('en-US', {
          hour: 'numeric', minute: '2-digit', hour12: state.config.timeFormat === '12h',
          timeZone: state.config.timezone,
        });
        new Notification(ev.title, { body: timeStr, tag: `ev-${ev.id}`, icon: '/icon-192.png' });
      }, delay));
    }
  }

  // Task reminders
  for (const task of state.tasks) {
    if (task.status === 'COMPLETED' || !task.taskReminder || task.taskReminder === 'none') continue;
    const alarmAt = taskAlarmDatetime(task.due, task.taskReminder, state.config);
    if (!alarmAt) continue;
    const delay = alarmAt.getTime() - now;
    if (delay > 0 && delay < 48 * 60 * 60 * 1000) {
      _notifTimers.push(setTimeout(() => {
        new Notification(task.title, { body: `Due: ${task.due}`, tag: `task-${task.id}`, icon: '/icon-192.png' });
      }, delay));
    }
  }
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

async function loadTasks() {
  const [tasksRes, sourcesRes] = await Promise.all([fetch('/tasks'), fetch('/task-sources')]);
  if (tasksRes.ok) setTasks(await tasksRes.json());
  if (sourcesRes.ok) setTaskSources(await sourcesRes.json());
  scheduleNotifications(); // re-run after tasks update to catch task reminders
}

async function loadWeather() {
  const lat = state.config.weatherLat;
  const lon = state.config.weatherLon;
  if (!lat || !lon) return;
  try {
    const res = await fetch(`/weather?lat=${lat}&lon=${lon}`);
    if (res.ok) setWeather(await res.json());
  } catch { /* weather is optional */ }
}

function detectAndLoadWeather() {
  if (state.config.weatherLat && state.config.weatherLon) {
    // Coordinates already saved — load and re-render so weather shows immediately
    loadWeather().then(() => render()).catch(() => {});
    return;
  }
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude.toFixed(4);
    const lon = pos.coords.longitude.toFixed(4);
    setConfig({ weatherLat: lat, weatherLon: lon });
    fetch('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weatherLat: lat, weatherLon: lon }),
    }).catch(() => {});
    loadWeather().then(() => render()).catch(() => {});
  }, () => { /* permission denied — no weather */ });
}

// ── Sync ──────────────────────────────────────────────────

async function handleSync() {
  syncBtn.classList.add('syncing');
  syncError.classList.add('hidden');
  try {
    const res = await fetch('/sync', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    await Promise.all([loadEvents(), loadTasks()]);
    render();
  } catch (err) {
    syncError.textContent = 'Sync failed: ' + err.message;
    syncError.classList.remove('hidden');
  } finally {
    syncBtn.classList.remove('syncing');
  }
}

// ── Event CRUD ────────────────────────────────────────────

function handleEventClick(event) {
  openEditEventModal(event, data => saveEvent(event.id, data), (ev, scope) => deleteEvent(ev, scope), handleDuplicateEvent);
}

function handleLongPressCreate(date) {
  openNewEventModal(date, data => saveEvent(null, data));
}

function handleDuplicateEvent(event) {
  const copy = {
    title: event.title + ' (copy)',
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    calendarId: event.calendarId,
    description: event.description || '',
  };
  openNewEventModal(new Date(event.start), data => saveEvent(null, { ...copy, ...data }));
}

function handleEventMove(eventId, day, startMin) {
  const ev = state.events.find(e => e.id === eventId);
  if (!ev) return;
  const duration = new Date(ev.end) - new Date(ev.start);
  const newStart = new Date(day);
  newStart.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  saveEvent(eventId, { start: newStart.toISOString(), end: new Date(newStart.getTime() + duration).toISOString() });
}

function handleEventResize(eventId, endMin) {
  const ev = state.events.find(e => e.id === eventId);
  if (!ev) return;
  const start = new Date(ev.start);
  const newEnd = new Date(start);
  newEnd.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
  if (newEnd - start < 15 * 60000) return;
  saveEvent(eventId, { end: newEnd.toISOString() });
}

async function saveEvent(id, data) {
  const method = id ? 'PUT' : 'POST';
  const url    = id ? `/events/${id}` : '/events';
  const body   = id ? data : { ...data, calendarId: data.calendarId || state.calendars[0]?.id };
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json()).error);
    await loadEvents();
    render();
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
}

async function deleteEvent(ev, scope) {
  try {
    const uid = ev.uid || ev.id || ev;
    let url = `/events/${uid}`;
    if (scope && ev.occurrenceDate) {
      url += '?' + new URLSearchParams({ scope, occurrenceDate: ev.occurrenceDate });
    }
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error('Delete failed');
    await loadEvents();
    render();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ── Task CRUD ─────────────────────────────────────────────

async function handleTaskComplete(task) {
  try {
    if (task.status === 'COMPLETED') {
      const res = await fetch(`/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'NEEDS-ACTION', completed: null }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } else {
      const res = await fetch(`/tasks/${task.id}/complete`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error);
    }
    await loadTasks();
    render();
  } catch (err) {
    alert('Could not update task: ' + err.message);
  }
}

async function handleTaskStar(task) {
  const categories = task.important
    ? (task.categories || []).filter(c => c !== 'important')
    : [...(task.categories || []), 'important'];
  try {
    const res = await fetch(`/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    await loadTasks();
    render();
  } catch (err) {
    alert('Could not update task: ' + err.message);
  }
}

async function handleTaskAdd({ title, due, categories, source, rrule, xRecurringType, xRecurringInterval, description }) {
  try {
    const body = { title, due };
    if (categories?.length) body.categories = categories;
    if (source) body.source = source;
    if (rrule) body.rrule = rrule;
    if (xRecurringType) body.xRecurringType = xRecurringType;
    if (xRecurringInterval) body.xRecurringInterval = xRecurringInterval;
    if (description) body.description = description;
    const res = await fetch('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    await loadTasks();
    render();
  } catch (err) {
    alert('Could not add task: ' + err.message);
  }
}

function handleTaskEdit(task) {
  openTaskModal(task, {
    onSave:   data => saveTask(task.id, data),
    onDelete: t    => handleTaskDelete(t),
  });
}

function handleNewTaskForDay(day) {
  const d = day;
  const due = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  openTaskModal({ due }, { onSave: data => handleTaskAdd(data), onDelete: () => {} });
}

async function saveTask(id, data) {
  try {
    const res = await fetch(`/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    await loadTasks();
    render();
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
}

async function handleTaskSnooze(task) {
  if (!task.due) return;
  const [y, m, d] = task.due.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  const nextStr = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
  try {
    const res = await fetch(`/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ due: nextStr }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    await loadTasks();
    render();
  } catch (err) {
    alert('Could not defer task: ' + err.message);
  }
}

function runSearch(query) {
  const q = query.trim().toLowerCase();
  searchResults.innerHTML = '';
  if (q.length < 2) return;

  const matches = [];

  for (const ev of state.events) {
    if (
      ev.title?.toLowerCase().includes(q) ||
      ev.description?.toLowerCase().includes(q) ||
      ev.location?.toLowerCase().includes(q)
    ) {
      matches.push({ type: 'event', item: ev });
    }
  }
  for (const task of state.tasks) {
    if (
      task.title?.toLowerCase().includes(q) ||
      task.description?.toLowerCase().includes(q)
    ) {
      matches.push({ type: 'task', item: task });
    }
  }

  if (!matches.length) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = 'No results for "' + query + '"';
    searchResults.appendChild(empty);
    return;
  }

  // Sort: tasks first by due, events by start
  matches.sort((a, b) => {
    const aDate = a.type === 'task' ? (a.item.due || '') : (a.item.start || '');
    const bDate = b.type === 'task' ? (b.item.due || '') : (b.item.start || '');
    return aDate.localeCompare(bDate);
  });

  for (const { type, item } of matches.slice(0, 50)) {
    const row = document.createElement('div');
    row.className = 'search-result-row';

    const icon = document.createElement('span');
    icon.className = 'search-result-icon';
    icon.textContent = type === 'task' ? '✓' : '▭';

    const info = document.createElement('div');
    info.className = 'search-result-info';

    const title = document.createElement('div');
    title.className = 'search-result-title';
    title.textContent = item.title;

    const sub = document.createElement('div');
    sub.className = 'search-result-sub';
    if (type === 'event') {
      const d = new Date(item.start);
      sub.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      if (item.location) sub.textContent += ' · ' + item.location;
    } else {
      sub.textContent = item.due ? 'Due: ' + item.due : 'No due date';
      if (item.description) sub.textContent += ' · ' + item.description.slice(0, 60);
    }

    info.appendChild(title);
    info.appendChild(sub);
    row.appendChild(icon);
    row.appendChild(info);

    row.addEventListener('click', () => {
      searchOverlay.classList.add('hidden');
      if (type === 'task') {
        handleTaskEdit(item);
      } else {
        handleEventClick(item);
      }
    });

    searchResults.appendChild(row);
  }
}

async function handleTaskDelete(task) {
  try {
    const res = await fetch(`/tasks/${task.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error('Delete failed');
    await loadTasks();
    render();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ── Login ─────────────────────────────────────────────────

function showLogin() {
  document.getElementById('login-overlay').classList.remove('hidden');
}

function initLogin() {
  const overlay = document.getElementById('login-overlay');
  const form    = document.getElementById('login-form');
  const errEl   = document.getElementById('login-error');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.classList.add('hidden');
    const password = document.getElementById('login-password').value;
    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) { errEl.classList.remove('hidden'); return; }
      overlay.classList.add('hidden');
      state._viewInitialized = false;
      const loaded = await loadAll();
      if (loaded) { buildNav(); render(); }
    } catch {
      errEl.classList.remove('hidden');
    }
  });
}

// ── Back-button / PWA history handling ───────────────────
// Push a state entry each time an overlay opens so the Android/PWA back
// button closes the overlay instead of exiting the app.

function pushOverlayState() {
  history.pushState({ overlay: true }, '');
}

function initBackButton() {
  window.addEventListener('popstate', e => {
    // Try to close the topmost open overlay in priority order
    const monthPopup  = document.getElementById('month-day-popup');
    const modalOverlay = document.getElementById('modal-overlay');
    const settingsOverlay = document.getElementById('settings-overlay');
    const calDrawer    = document.getElementById('cal-drawer');
    const searchOv     = document.getElementById('search-overlay');

    if (monthPopup) { monthPopup.remove(); history.pushState({ overlay: true }, ''); return; }
    if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
      modalOverlay.classList.add('hidden'); history.pushState({ overlay: true }, ''); return;
    }
    if (settingsOverlay && !settingsOverlay.classList.contains('hidden')) {
      settingsOverlay.classList.add('hidden'); history.pushState({ overlay: true }, ''); return;
    }
    if (searchOv && !searchOv.classList.contains('hidden')) {
      searchOv.classList.add('hidden'); history.pushState({ overlay: true }, ''); return;
    }
    if (calDrawer && !calDrawer.classList.contains('hidden')) {
      calDrawer.classList.add('hidden'); history.pushState({ overlay: true }, ''); return;
    }
    // Nothing open — push a new state so the next back still doesn't exit
    if (e.state?.overlay) history.pushState({ overlay: true }, '');
  });

  // Seed the initial history entry so there's always something to go back from
  if (!history.state?.overlay) history.pushState({ overlay: true }, '');
}

// ── Boot ──────────────────────────────────────────────────

async function init() {
  initTheme();
  initLogin();
  initModal();
  initCalendarDrawer(render);
  initSettingsPanel(() => {
    buildNav();
    render();
    // Reload weather if location was changed
    loadWeather().then(() => render()).catch(() => {});
  });
  initInstallPrompt();
  initBackButton();

  window.addEventListener('offline', () => {
    syncError.textContent = 'Offline — showing cached events';
    syncError.classList.remove('hidden');
  });
  window.addEventListener('online', () => {
    syncError.classList.add('hidden');
  });

  syncBtn.addEventListener('click', handleSync);
  calBtn.addEventListener('click', openDrawer);
  settingsBtn.addEventListener('click', openSettings);

  // Search
  document.getElementById('search-btn').addEventListener('click', () => {
    searchOverlay.classList.remove('hidden');
    searchInput.value = '';
    searchResults.innerHTML = '';
    searchInput.focus();
  });
  document.getElementById('search-close').addEventListener('click', () => searchOverlay.classList.add('hidden'));
  searchOverlay.addEventListener('click', e => { if (e.target === searchOverlay) searchOverlay.classList.add('hidden'); });
  searchInput.addEventListener('input', () => runSearch(searchInput.value));

  // Calendar quick-add bar
  const calQuickAddFb = document.getElementById('cal-quickadd-nlp-fb');
  let calNlpTimer = null;

  calQuickAddInput.addEventListener('input', () => {
    clearTimeout(calNlpTimer);
    const text = calQuickAddInput.value.trim();
    if (!text) { calQuickAddFb.classList.add('hidden'); return; }
    calNlpTimer = setTimeout(async () => {
      try {
        const res = await fetch('/nlp/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        if (!data.parsed || !data.parsedText) { calQuickAddFb.classList.add('hidden'); return; }
        const raw = calQuickAddInput.value;
        const idx = raw.toLowerCase().indexOf(data.parsedText.toLowerCase());
        calQuickAddFb.innerHTML = '';
        if (idx !== -1) {
          const preview = document.createElement('div');
          preview.className = 'nlp-input-preview';
          preview.appendChild(document.createTextNode(raw.slice(0, idx)));
          const mark = document.createElement('mark');
          mark.className = 'nlp-match';
          mark.textContent = raw.slice(idx, idx + data.parsedText.length);
          preview.appendChild(mark);
          preview.appendChild(document.createTextNode(raw.slice(idx + data.parsedText.length)));
          calQuickAddFb.appendChild(preview);
        }
        const start = new Date(data.start);
        const tz = state.config.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
        const timeStr = data.allDay ? 'All day' : start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
        const summary = document.createElement('div');
        summary.textContent = `${dateStr} · ${timeStr}${data.rrule ? ' · Repeats' : ''}`;
        calQuickAddFb.appendChild(summary);
        calQuickAddFb.classList.remove('hidden');
      } catch {
        calQuickAddFb.classList.add('hidden');
      }
    }, 320);
  });

  async function submitCalQuickAdd() {
    const text = calQuickAddInput.value.trim();
    if (!text) return;
    calQuickAddInput.value = '';
    calQuickAddFb.classList.add('hidden');
    clearTimeout(calNlpTimer);
    try {
      const res = await fetch('/nlp/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.parsed) {
        await saveEvent(null, {
          title: data.title,
          start: data.start,
          end: data.end,
          allDay: data.allDay,
          calendarId: state.config.defaultCalendar || state.calendars[0]?.id,
          description: '',
          ...(data.rrule ? { rrule: data.rrule } : {}),
          alarmMinutes: state.config.alarmDefaultMinutes || null,
        });
      } else {
        // NLP didn't parse — open modal with just the title pre-filled
        const d = state.selectedDate || new Date();
        openNewEventModal(d, eventData => saveEvent(null, eventData));
        setTimeout(() => {
          document.getElementById('f-title').value = text;
        }, 50);
      }
    } catch {
      // On error, open modal
      openNewEventModal(state.selectedDate || new Date(), data => saveEvent(null, data));
    }
  }
  calQuickAddInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitCalQuickAdd(); });
  document.getElementById('cal-quickadd-submit').addEventListener('click', submitCalQuickAdd);

  fab.addEventListener('click', () => {
    if (state.activeView === 'tasks') {
      openTaskModal({}, { onSave: data => handleTaskAdd(data), onDelete: () => {} });
      return;
    }
    openNewEventModal(state.selectedDate || new Date(), data => saveEvent(null, data));
  });

  try {
    const loaded = await loadAll();
    if (!loaded) return;
    buildNav();
    render();
    // Weather: detect location and load asynchronously (doesn't block render)
    detectAndLoadWeather();
    // Refresh weather every hour
    setInterval(() => { loadWeather().then(() => render()); }, 60 * 60 * 1000);
    // Auto-refresh events + tasks on the same interval as the server background sync
    // so the UI stays current without a manual sync press
    function scheduleClientRefresh() {
      const ms = Math.max(1, state.config.syncIntervalMinutes ?? 2) * 60 * 1000;
      setTimeout(async () => {
        try {
          await Promise.all([loadEvents(), loadTasks()]);
          render();
        } catch { /* silent — sync banner will show if server is unreachable */ }
        scheduleClientRefresh();
      }, ms);
    }
    scheduleClientRefresh();
  } catch (err) {
    syncError.textContent = 'Failed to load: ' + err.message;
    syncError.classList.remove('hidden');
  }
}

init();
