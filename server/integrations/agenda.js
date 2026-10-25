const { meetingUrl } = require('./meetingUrl');

const DEFAULT_HOURS = 48;
const MAX_HOURS = 24 * 7;
// A running occurrence started before now. A week back covers multi-day events
// without expanding every series from the beginning of time.
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
// Feeds without a colour still need one for the widget's bar.
const FALLBACK_COLORS = ['#4a90d9', '#7ed321', '#d0021b', '#f5a623', '#50e3c2', '#9b59b6'];
const CANCELLED_TITLE = /^\s*(?:Canceled|Cancelled|Avlyst)\s*:/i;

/**
 * @param {*} value - the `hours` query parameter
 * @returns {number}
 */
function agendaHours(value) {
  const requested = parseInt(value, 10);
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_HOURS;
  return Math.min(requested, MAX_HOURS);
}

/**
 * The window to expand occurrences over for an agenda asked at `now`.
 * @param {Date} now
 * @param {number} hours
 * @returns {{ from: Date, to: Date }}
 */
function agendaWindow(now, hours) {
  return {
    from: new Date(now.getTime() - LOOKBACK_MS),
    to: new Date(now.getTime() + hours * 60 * 60 * 1000),
  };
}

/**
 * Profile id → the calendars it hides. Profiles are client-side presets, so
 * the widget gets the lists and filters (and labels Work/Personal) offline.
 * @param {Record<string, any>} settings
 * @returns {Record<string, string[]>}
 */
function profileLists(settings) {
  /** @type {Record<string, string[]>} */
  const profiles = {};
  for (const [id, profile] of Object.entries(settings.profiles || {})) {
    const hidden = Array.isArray(profile?.hiddenCalendars) ? profile.hiddenCalendars : [];
    profiles[id] = hidden.map(String);
  }
  return profiles;
}

/**
 * @param {Array<{ id: string, name?: string, color?: string }>} calendars
 */
function calendarList(calendars) {
  const list = [];
  for (const [index, calendar] of calendars.entries()) {
    let color = calendar.color;
    if (!color) color = FALLBACK_COLORS[index % FALLBACK_COLORS.length];
    list.push({ id: calendar.id, name: calendar.name || calendar.id, color });
  }
  return list;
}

/**
 * @param {object} ev - a cache record or expanded occurrence
 * @param {Date} now
 * @param {Date} to
 * @returns {boolean}
 */
function isUpcoming(ev, now, to) {
  if (ev.status === 'CANCELLED') return false;
  if (CANCELLED_TITLE.test(ev.title || '')) return false;
  return new Date(ev.end).getTime() > now.getTime() && new Date(ev.start).getTime() < to.getTime();
}

/**
 * The read-only agenda Glance renders: occurrences running now or starting in
 * the next `hours`, the calendars they belong to, and every profile's hidden list.
 * @param {{ now: Date, hours: number, occurrences: object[], calendars: object[],
 *   settings: Record<string, any>, timezone: string }} input
 */
function buildAgenda({ now, hours, occurrences, calendars, settings, timezone }) {
  const { to } = agendaWindow(now, hours);
  const events = [];
  for (const ev of occurrences) {
    if (!isUpcoming(ev, now, to)) continue;
    events.push({
      id: ev.id || ev.uid,
      title: ev.title || '',
      start: ev.start,
      end: ev.end,
      allDay: !!ev.allDay,
      calendarId: ev.calendarId,
      location: ev.location || '',
      meetingUrl: meetingUrl(ev),
      status: ev.status || 'CONFIRMED',
    });
  }
  events.sort(function byStart(a, b) {
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
  return {
    generatedAt: now.toISOString(),
    timezone,
    profiles: profileLists(settings),
    calendars: calendarList(calendars),
    events,
  };
}

module.exports = { agendaHours, agendaWindow, buildAgenda };
