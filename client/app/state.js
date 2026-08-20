/**
 * Canonical client-side data shapes. The server sends these over /events,
 * /calendars, /tasks, /task-sources; a future TypeScript port lifts these
 * typedefs verbatim (maily convergence).
 *
 * @typedef {Object} Calendar
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {boolean} [readOnly] - true for subscribed ICS feed pseudo-calendars
 *
 * @typedef {Object} CalEvent
 * @property {string} id - unique per expanded occurrence
 * @property {string} [uid] - iCalendar UID (shared by all occurrences of a series)
 * @property {string} title
 * @property {string} start - ISO UTC ("T00:00:00Z" midnight for all-day)
 * @property {string} end - ISO UTC
 * @property {boolean} [allDay]
 * @property {string} calendarId
 * @property {string} [description]
 * @property {string} [location]
 * @property {string} [url]
 * @property {string} [rrule]
 * @property {boolean} [recurring] - true on expanded occurrences of a series
 * @property {string} [occurrenceDate] - ISO date of this occurrence within its series
 * @property {string|null} [recurrenceId] - set only on an occurrence edited out of
 *   its series (RECURRENCE-ID): the instant it would have started at
 * @property {number|null} [alarmMinutes]
 * @property {string[]} [categories]
 *
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} [uid]
 * @property {string} title
 * @property {string|null} [due] - date-only string YYYY-MM-DD
 * @property {string} [status] - "NEEDS-ACTION" | "COMPLETED"
 * @property {string|null} [completed]
 * @property {string[]} [categories]
 * @property {string} [source] - task-source CalDAV URL
 * @property {string} [description]
 * @property {string} [rrule]
 * @property {string} [xRecurringType] - custom after-completion recurrence
 * @property {number} [xRecurringInterval]
 * @property {string} [taskReminder] - "none" | "on-due" | "evening-before" | …
 * @property {boolean} [important]
 *
 * @typedef {Object} TaskSource
 * @property {string} url
 * @property {string} name
 * @property {string} [color]
 */

export const state = {
  /** True while the app is displaying cached data without a network connection. */
  isOffline: false,
  /** @type {Calendar[]} */
  calendars: [],
  /** @type {CalEvent[]} */
  events: [],
  /** @type {Task[]} */
  tasks: [],
  /** @type {TaskSource[]} */
  taskSources: [],
  /** @type {{ current: {temp: number, symbol: string, emoji: string}|null, daily: Record<string, any> }|null} */
  weather: null,
  /** @type {'agenda'|'day'|'week'|'month'|'tasks'} */
  activeView: 'agenda',
  /** @type {Date} - anchor date for day/week views */
  selectedDate: new Date(),
  /** @type {Set<string>} - calendarIds currently hidden */
  hiddenCalendars: new Set(),
  /**
   * Settings blob merged from server /settings. Loosely typed on purpose —
   * tightening it into a full typedef is future maily-convergence work.
   * @type {Record<string, any>}
   */
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
    hiddenEventCategories: [],
    defaultTaskSource: '',
    defaultEventTime: '09:00',
    defaultEventDuration: 60,
    showWeekNumbers: false,
    dateFormat: 'dmy',
    weatherLat: '',
    weatherLon: '',
    weatherDays: 6,
    /** @type {Array<{id, name, url, color}>} read-only ICS subscription feeds */
    icsFeeds: [],
    /** @type {string} id of the active profile preset */
    activeProfile: 'personal',
    /** @type {Object<string, {name, hiddenCalendars, accentColor, defaultTaskSource, defaultEventCalendar, defaultView}>} */
    profiles: {
      single: {
        name: 'Single',
        hiddenCalendars: [],
        accentColor: '',
        defaultTaskSource: '',
        defaultEventCalendar: '',
        defaultView: '',
      },
      personal: {
        name: 'Personal',
        hiddenCalendars: [],
        accentColor: '',
        defaultTaskSource: '',
        defaultEventCalendar: '',
        defaultView: '',
      },
      work: {
        name: 'Work',
        hiddenCalendars: [],
        accentColor: '',
        defaultTaskSource: '',
        defaultEventCalendar: '',
        defaultView: '',
      },
    },
  },
};

export function setCalendars(cals) {
  state.calendars = cals;
}
export function setEvents(evts) {
  state.events = evts;
}
export function setTasks(tasks) {
  state.tasks = tasks;
}
export function setTaskSources(sources) {
  state.taskSources = sources;
}
export function setWeather(w) {
  state.weather = w;
}
export function setConfig(cfg) {
  state.config = { ...state.config, ...cfg };
}

export function calendarById(id) {
  return state.calendars.find((c) => c.id === id) || null;
}
