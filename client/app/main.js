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
  else if (state.activeView === 'month') renderMonth(viewContainer, handleEventClick, handleDayClick, handleEventMove, () => switchView('tasks'), handleLongPressCreate, handleTaskComplete, handleTaskEdit);
  else                                   renderAgenda(viewContainer, handleEventClick, handleTaskEdit, handleTaskComplete);
}

function handleDayClick(date) {
  state.selectedDate = date;
  const enabled = state.config.enabledViews || ['day'];
  const target = ['day', 'week', 'agenda'].find(v => enabled.includes(v)) || enabled[0];
  switchView(target);
}

// ── Data loading ──────────────────────────────────────────

function rangeFrom() { return new Date(Date.now() - 30 * 86400000).toISOString(); }
function rangeTo()   { return new Date(Date.now() + 90 * 86400000).toISOString(); }

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
  setEvents(await res.json());
}

async function loadTasks() {
  const [tasksRes, sourcesRes] = await Promise.all([fetch('/tasks'), fetch('/task-sources')]);
  if (tasksRes.ok) setTasks(await tasksRes.json());
  if (sourcesRes.ok) setTaskSources(await sourcesRes.json());
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
    loadWeather();
    return;
  }
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude.toFixed(4);
    const lon = pos.coords.longitude.toFixed(4);
    setConfig({ weatherLat: lat, weatherLon: lon });
    // Persist so subsequent loads skip the geolocation prompt
    fetch('/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weatherLat: lat, weatherLon: lon }),
    }).catch(() => {});
    loadWeather();
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
  } catch (err) {
    syncError.textContent = 'Failed to load: ' + err.message;
    syncError.classList.remove('hidden');
  }
}

init();
