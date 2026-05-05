import { state, setCalendars, setEvents, setConfig } from './state.js';
import { renderAgenda } from '../views/agenda.js';
import { initModal, openNewEventModal, openEditEventModal } from '../components/modalEditor.js';

const viewContainer = document.getElementById('view-container');
const syncBtn = document.getElementById('sync-btn');
const syncError = document.getElementById('sync-error');
const fab = document.getElementById('fab');

async function loadData() {
  const [cfgRes, calRes, evRes] = await Promise.all([
    fetch('/config'),
    fetch('/calendars'),
    fetch(`/events?from=${rangeFrom()}&to=${rangeTo()}`),
  ]);
  setConfig(await cfgRes.json());
  setCalendars(await calRes.json());
  setEvents(await evRes.json());
}

function rangeFrom() { return new Date(Date.now() - 30 * 86400000).toISOString(); }
function rangeTo()   { return new Date(Date.now() + 90 * 86400000).toISOString(); }

function render() {
  renderAgenda(viewContainer, handleEventClick);
}

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

async function loadEvents() {
  const res = await fetch(`/events?from=${rangeFrom()}&to=${rangeTo()}`);
  setEvents(await res.json());
}

function handleEventClick(event) {
  openEditEventModal(
    event,
    data => saveEvent(event.id, data),
    id => deleteEvent(id),
  );
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

async function init() {
  initModal();
  syncBtn.addEventListener('click', handleSync);
  fab.addEventListener('click', () => {
    openNewEventModal(new Date(), data => saveEvent(null, data));
  });
  try {
    await loadData();
    render();
  } catch (err) {
    syncError.textContent = 'Failed to load: ' + err.message;
    syncError.classList.remove('hidden');
  }
}

init();
