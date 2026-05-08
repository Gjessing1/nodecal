export const state = {
  /** @type {Array<{id, name, color}>} */
  calendars: [],
  /** @type {Array<{id, title, start, end, allDay, calendarId}>} */
  events: [],
  /** @type {Array} */
  tasks: [],
  /** @type {Array<{url: string, name: string}>} */
  taskSources: [],
  /** @type {{ current: {temp,symbol,emoji}|null, daily: object }|null} */
  weather: null,
  /** @type {'agenda'|'day'|'week'|'month'|'tasks'} */
  activeView: 'agenda',
  /** @type {Date} - anchor date for day/week views */
  selectedDate: new Date(),
  /** @type {Set<string>} - calendarIds currently hidden */
  hiddenCalendars: new Set(),
  /** @type {object} */
  config: {
    timeFormat: '24h',
    weekStart: 'monday',
    timezone: 'UTC',
    defaultView: 'agenda',
    enabledViews: ['agenda', 'day', 'week', 'month'],
    enableTasksView: false,
    showTasksOnCalendar: false,
    taskSortOrder: 'due',
    tasksCalDAVUrl: '',
    hiddenCategories: [],
    defaultTaskSource: '',
    defaultEventTime: '09:00',
    defaultEventDuration: 60,
    showWeekNumbers: false,
    dateFormat: 'dmy',
    weatherLat: '',
    weatherLon: '',
  },
};

export function setCalendars(cals) { state.calendars = cals; }
export function setEvents(evts) { state.events = evts; }
export function setTasks(tasks) { state.tasks = tasks; }
export function setTaskSources(sources) { state.taskSources = sources; }
export function setWeather(w) { state.weather = w; }
export function setConfig(cfg) { state.config = { ...state.config, ...cfg }; }

export function calendarById(id) {
  return state.calendars.find(c => c.id === id) || null;
}
