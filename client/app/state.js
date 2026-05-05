export const state = {
  /** @type {Array<{id, name, color}>} */
  calendars: [],
  /** @type {Array<{id, title, start, end, allDay, calendarId}>} */
  events: [],
  /** @type {'agenda'|'day'|'week'} */
  activeView: 'agenda',
  /** @type {Date} - anchor date for day/week views */
  selectedDate: new Date(),
  /** @type {Set<string>} - calendarIds currently hidden */
  hiddenCalendars: new Set(),
  /** @type {{timeFormat: string, weekStart: string, timezone: string}} */
  config: { timeFormat: '24h', weekStart: 'monday', timezone: 'UTC' },
};

export function setCalendars(cals) { state.calendars = cals; }
export function setEvents(evts) { state.events = evts; }
export function setConfig(cfg) { state.config = { ...state.config, ...cfg }; }

export function calendarById(id) {
  return state.calendars.find(c => c.id === id) || null;
}
