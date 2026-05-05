import { state, setCalendars, setEvents, setConfig } from './state.js';
import { renderAgenda } from '../views/agenda.js';
import { renderDay, destroyDay } from '../views/day.js';
import { renderWeek, destroyWeek } from '../views/week.js';
import { initModal, openNewEventModal, openEditEventModal } from '../components/modalEditor.js';
import { initCalendarDrawer, openDrawer } from '../components/calendarDrawer.js';

const viewContainer = document.getElementById('view-container');
const syncBtn = document.getElementById('sync-btn');
const syncError = document.getElementById('sync-error');
const fab = document.getElementById('fab');
const calBtn = document.getElementById('cal-btn');
const navBtns = document.querySelectorAll('.nav-btn');

// ── View rendering ────────────────────────────────────────

function render() {
  destroyDay();
  destroyWeek();
  if (state.activeView === 'day') renderDay(viewContainer, handleEventClick);
  else if (state.activeView === 'week') renderWeek(viewContainer, handleEventClick);
  else renderAgenda(viewContainer, handleEventClick);
}

function switchView(viewName) {
  state.activeView = viewName;
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === viewName));
  render();
}

// ── Data loading ──────────────────────────────────────────

function rangeFrom() { return new Date(Date.now() - 30 * 86400000).toISOString(); }
function rangeTo()   { return new Date(Date.now() + 90 * 86400000).toISOString(); }

async function loadAll() {
  const [cfgRes, calRes, evRes] = await Promise.all([
    fetch('/config'),
    fetch('/calendars'),
    fetch(`/events?from=${rangeFrom()}&to=${rangeTo()}`),
  ]);
  setConfig(await cfgRes.json());
  setCalendars(await calRes.json());
  setEvents(await evRes.json());
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
  openEditEventModal(event, data => saveEvent(event.id, data), id => deleteEvent(id));
}

async function saveEvent(id, data) {
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/events/${id}` : '/events';
  const body = id ? data : { ...data, calendarId: data.calendarId || state.calendars[0]?.id };
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json()).error);
    await loadEvents();
    render();
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
}

async function deleteEvent(id) {
  try {
    const res = await fetch(`/events/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error('Delete failed');
    await loadEvents();
    render();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

// ── Boot ──────────────────────────────────────────────────

async function init() {
  initModal();
  initCalendarDrawer(render);

  navBtns.forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  syncBtn.addEventListener('click', handleSync);
  calBtn.addEventListener('click', openDrawer);
  fab.addEventListener('click', () => openNewEventModal(new Date(), data => saveEvent(null, data)));

  try {
    await loadAll();
    render();
  } catch (err) {
    syncError.textContent = 'Failed to load: ' + err.message;
    syncError.classList.remove('hidden');
  }
}

init();
