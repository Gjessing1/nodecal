process.env.CALDAV_BASEURL = process.env.CALDAV_BASEURL || 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = process.env.CALDAV_USERNAME || 'test';
process.env.CALDAV_PASSWORD = process.env.CALDAV_PASSWORD || 'test';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { agendaHours, buildAgenda } = require('../server/integrations/agenda');
const { meetingUrl } = require('../server/integrations/meetingUrl');

const NOW = new Date('2026-10-26T08:15:00Z');

/** @param {Record<string, any>} fields */
function event(fields) {
  return { uid: 'e', calendarId: 'cal', allDay: false, ...fields };
}

/** @param {object[]} occurrences */
function agenda(occurrences) {
  return buildAgenda({
    now: NOW,
    hours: 48,
    occurrences,
    calendars: [
      { id: 'ics:work', name: 'Enora', color: '#ba6e03' },
      { id: 'cal', name: 'Kalender' },
    ],
    settings: {
      profiles: {
        personal: { hiddenCalendars: ['ics:work'] },
        work: { hiddenCalendars: ['cal'] },
        combined: {},
      },
    },
    timezone: 'Europe/Oslo',
  });
}

describe('glance agenda', () => {
  it('keeps a running meeting and drops ended and far-off ones', () => {
    const result = agenda([
      event({
        id: 'later',
        title: 'Dentist',
        start: '2026-10-26T10:00:00Z',
        end: '2026-10-26T11:00:00Z',
      }),
      event({
        id: 'running',
        title: 'Standup',
        start: '2026-10-26T08:00:00Z',
        end: '2026-10-26T08:30:00Z',
      }),
      event({
        id: 'ended',
        title: 'Gym',
        start: '2026-10-26T06:00:00Z',
        end: '2026-10-26T07:00:00Z',
      }),
      event({
        id: 'far',
        title: 'Trip',
        start: '2026-10-29T10:00:00Z',
        end: '2026-10-29T11:00:00Z',
      }),
    ]);
    assert.deepEqual(
      result.events.map((ev) => ev.id),
      ['running', 'later'],
    );
  });

  it('drops cancelled events, including Outlook "Canceled:" titles', () => {
    const result = agenda([
      event({
        id: 'a',
        title: 'Canceled: Sync',
        start: '2026-10-26T10:00:00Z',
        end: '2026-10-26T11:00:00Z',
      }),
      event({
        id: 'b',
        title: 'Review',
        status: 'CANCELLED',
        start: '2026-10-26T10:00:00Z',
        end: '2026-10-26T11:00:00Z',
      }),
      event({
        id: 'c',
        title: 'Planning',
        status: 'TENTATIVE',
        start: '2026-10-26T10:00:00Z',
        end: '2026-10-26T11:00:00Z',
      }),
    ]);
    assert.deepEqual(
      result.events.map((ev) => [ev.id, ev.status]),
      [['c', 'TENTATIVE']],
    );
  });

  it('sends profile lists and gives every calendar a colour', () => {
    const result = agenda([]);
    assert.deepEqual(result.profiles, { personal: ['ics:work'], work: ['cal'], combined: [] });
    assert.equal(result.calendars[0].color, '#ba6e03');
    assert.match(result.calendars[1].color, /^#[0-9a-f]{6}$/i);
  });

  it('keeps an all-day event of today as an all-day event', () => {
    const result = agenda([
      event({
        id: 'bday',
        title: "Emma's birthday",
        allDay: true,
        start: '2026-10-26T00:00:00Z',
        end: '2026-10-27T00:00:00Z',
      }),
    ]);
    assert.equal(result.events[0].allDay, true);
    assert.equal(result.events[0].start, '2026-10-26T00:00:00Z');
  });

  it('clamps the hours parameter', () => {
    assert.equal(agendaHours(undefined), 48);
    assert.equal(agendaHours('-3'), 48);
    assert.equal(agendaHours('12'), 12);
    assert.equal(agendaHours('9999'), 168);
  });
});

describe('meetingUrl', () => {
  it('finds a Teams link in an Outlook description', () => {
    const description =
      'Join: https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=x.\nOther text';
    assert.equal(
      meetingUrl({ description }),
      'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=x',
    );
  });

  it('prefers the url field, then location, then description', () => {
    assert.equal(
      meetingUrl({
        url: 'https://meet.google.com/abc-defg-hij',
        location: 'https://us02web.zoom.us/j/123',
      }),
      'https://meet.google.com/abc-defg-hij',
    );
    assert.equal(
      meetingUrl({ location: 'Room 4 (https://whereby.com/team)' }),
      'https://whereby.com/team',
    );
  });

  it('ignores ordinary links', () => {
    assert.equal(meetingUrl({ description: 'See https://example.com/teams.microsoft.com' }), '');
    assert.equal(meetingUrl({}), '');
  });
});
