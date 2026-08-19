import { setConfig, setTaskSources } from '../../app/state.js';
import { registerProfileTaskSources } from '../../app/profiles.js';
import { MAX_NAV_TABS } from './sections.js';
import { usableIcsFeeds } from './icsFeeds.js';

/** Settings the server accepts verbatim from the draft. */
const SAVED_KEYS = [
  'enabledViews',
  'defaultView',
  'timeFormat',
  'weekStart',
  'dateFormat',
  'enableTasksView',
  'showTasksOnDay',
  'showTasksOnWeek',
  'showTasksOnMonth',
  'showTasksOnAgenda',
  'showWeekNumbersDay',
  'showWeekNumbersMonth',
  'showWeekNumbersAgenda',
  'showWeekendBg',
  'taskSortOrder',
  'defaultTaskSource',
  'hiddenCategories',
  'hiddenEventCategories',
  'enableNotifications',
  'alarmDefaultMinutes',
  'taskReminderDefault',
  'taskReminderMorningTime',
  'taskReminderEveningTime',
  'agendaDays',
  'syncIntervalMinutes',
  'syncHistoryDays',
  'syncFutureDays',
  'defaultEventTime',
  'defaultEventDuration',
  'weatherLat',
  'weatherLon',
  'weatherDaysWeek',
  'weatherDaysMonth',
  'weatherDaysAgenda',
  'profiles',
  'activeProfile',
];

// The per-view flags that replaced two older single switches. The summaries are
// still written so settings saved before the split keep meaning the same thing.
const TASKS_ON_VIEW = [
  'showTasksOnDay',
  'showTasksOnWeek',
  'showTasksOnMonth',
  'showTasksOnAgenda',
];
const WEEK_NUMBERS_ON_VIEW = [
  'showWeekNumbersDay',
  'showWeekNumbersMonth',
  'showWeekNumbersAgenda',
];

function summarise(draft, keys, summaryKey) {
  for (const key of keys) {
    if (draft[key] ?? draft[summaryKey]) return true;
  }
  return false;
}

function buildPayload(draft) {
  const payload = {};
  for (const key of SAVED_KEYS) {
    if (draft[key] !== undefined) payload[key] = draft[key];
  }
  payload.showTasksOnCalendar = summarise(draft, TASKS_ON_VIEW, 'showTasksOnCalendar');
  payload.showWeekNumbers = summarise(draft, WEEK_NUMBERS_ON_VIEW, 'showWeekNumbers');
  payload.taskSources = draft.taskSources || [];
  payload.icsFeeds = usableIcsFeeds(draft);
  if (draft.defaultCalendar) payload.defaultCalendar = draft.defaultCalendar;
  return payload;
}

/**
 * Validate the draft, persist it, and fold it back into live state.
 * @param {Record<string, any>} draft
 * @returns {Promise<boolean>} false when the draft was rejected or the save failed
 */
export async function saveSettings(draft) {
  const views = draft.enabledViews || [];
  if (!views.length) {
    alert('At least one view must be enabled.');
    return false;
  }
  if (views.length + (draft.enableTasksView ? 1 : 0) > MAX_NAV_TABS) {
    alert(`Maximum ${MAX_NAV_TABS} navigation tabs allowed.`);
    return false;
  }

  // A profile may point at any calendar; make sure each chosen one is a
  // registered task source so the server actually syncs it.
  registerProfileTaskSources(draft);

  const payload = buildPayload(draft);
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error);
  } catch (err) {
    alert('Could not save settings: ' + err.message);
    return false;
  }

  setConfig({ ...payload, defaultCalendar: draft.defaultCalendar || null });
  setTaskSources(payload.taskSources);
  return true;
}
