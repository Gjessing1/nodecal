import { state, setCalendars, setEvents, setConfig } from './state.js';
import { renderAgenda } from '../views/agenda.js';
import { renderDay, destroyDay } from '../views/day.js';
import { renderWeek, destroyWeek } from '../views/week.js';
import { renderMonth } from '../views/month.js';
import { initModal, openNewEventModal, openEditEventModal } from '../components/modalEditor.js';
import { initCalendarDrawer, openDrawer } from '../components/calendarDrawer.js';
import { initSettingsPanel, openSettings } from '../components/settingsPanel.js';
import { initInstallPrompt } from './installPrompt.js';
import { initTheme } from './theme.js';

const viewContainer = document.getElementById('view-container');
const syncBtn       = document.getElementById('sync-btn');
const syncError     = document.getElementById('sync-error');
const fab           = document.getElementById('fab');
const calBtn        = document.getElementById('cal-btn');
const settingsBtn   = document.getElementById('settings-btn');
const bottomNav     = document.getElementById('bottom-nav');

const VIEW_META = {
  agenda: { icon: '≡', label: 'Agenda' },
  day:    { icon: '▭', label: 'Day' },
  week:   { icon: '⊞', label: 'Week' },
  month:  { icon: '⊟', label: 'Month' },
};

// ── Navigation ────────────────────────────────────────────

function buildNav() {
  bottomNav.innerHTML = '';
  for (const viewId of (state.config.enabledViews || Object.keys(VIEW_META))) {
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
  const enabled = state.config.enabledViews || Object.keys(VIEW_META);
  if (!enabled.includes(viewName)) return;
  // Tapping the active day view resets to today
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
};

function render() {
  destroyDay();
  destroyWeek();
  if      (state.activeView === 'day')   renderDay(viewContainer, viewCallbacks);
  else if (state.activeView === 'week')  renderWeek(viewContainer, viewCallbacks);
  else if (state.activeView === 'month') renderMonth(viewContainer, handleEventClick, handleDayClick, handleEventMove);
  else                                   renderAgenda(viewContainer, handleEventClick);
}

function handleDayClick(date) {
  state.selectedDate = date;
  // Navigate to day view, falling back to the first available timed view
  const enabled = state.config.enabledViews || ['day'];
  const target = ['day', 'week', 'agenda'].find(v => enabled.includes(v)) || enabled[0];
  switchView(target);
}

// ── Data loading ──────────────────────────────────────────

function rangeFrom() { return new Date(Date.now() - 30 * 86400000).toISOString(); }
function rangeTo()   { return new Date(Date.now() + 90 * 86400000).toISOString(); }

async function loadAll() {
  const [settingsRes, calRes, evRes] = await Promise.all([
    fetch('/settings'),
    fetch('/calendars'),
    fetch(`/events?from=${rangeFrom()}&to=${rangeTo()}`),
  ]);
  if (settingsRes.status === 401) { showLogin(); return false; }
  const settings = await settingsRes.json();
  setConfig(settings);
  setCalendars(await calRes.json());
  setEvents(await evRes.json());
  // Set initial view from config if not already navigated
  if (!state._viewInitialized) {
    const enabled = settings.enabledViews || ['agenda'];
    const def = settings.defaultView || enabled[0];
    state.activeView = enabled.includes(def) ? def : enabled[0];
    state._viewInitialized = true;
  }
  return true;
}

async function loadEvents() {
  const res = await fetch(`/events?from=${rangeFrom()}&to=${rangeTo()}`);
  setEvents(await res.json());
}

// ── Sync ──────────────────────────────────────────────────

async function handleSync() {
  syncBtn.classList.add('syncing');
  syncError.classList.add('hidden');
  try {
    const res = await fetch('/sync', { method: 'POST' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    await loadEvents();
    render();
  } catch (err) {
    syncError.textContent = 'Sync failed: ' + err.message;
    syncError.classList.remove('hidden');
  } finally {
    syncBtn.classList.remove('syncing');
  }
}

// ── CRUD ──────────────────────────────────────────────────

function handleEventClick(event) {
  openEditEventModal(event, data => saveEvent(event.id, data), (ev, scope) => deleteEvent(ev, scope));
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

// ── Boot ──────────────────────────────────────────────────

async function init() {
  initTheme();
  initLogin();
  initModal();
  initCalendarDrawer(render);
  initSettingsPanel(() => { buildNav(); render(); });
  initInstallPrompt();

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
  fab.addEventListener('click', () => {
    // Use the viewed day so tapping + in Saturday's day view opens a Saturday modal
    openNewEventModal(state.selectedDate || new Date(), data => saveEvent(null, data));
  });

  try {
    const loaded = await loadAll();
    if (!loaded) return;
    buildNav();
    render();
  } catch (err) {
    syncError.textContent = 'Failed to load: ' + err.message;
    syncError.classList.remove('hidden');
  }
}

init();
