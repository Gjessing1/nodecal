process.env.CALDAV_BASEURL = 'http://localhost:5232/test';
process.env.CALDAV_USERNAME = 'test';
process.env.CALDAV_PASSWORD = 'test';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseIcs, serializeEvent } = require('../server/caldav/vevent');
const { syncIcsFeed } = require('../server/caldav/sync');
const { collectReminders } = require('../server/push/reminders');
const store = require('../server/cache/store');
const eventsRouter = require('../server/routes/events');

const FROM = new Date('2026-08-17T00:00:00Z');
const TO = new Date('2026-09-01T00:00:00Z');
const realFetch = globalThis.fetch;

function calendar(...bodies) {
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${bodies.join('\n')}\nEND:VCALENDAR`;
}

function event(uid, status = '') {
  return `BEGIN:VEVENT\nUID:${uid}\nDTSTART:20260817T100000Z\nDTEND:20260817T110000Z\nSUMMARY:${uid}\n${status}END:VEVENT`;
}

async function getEvents() {
  const app = express();
  app.use(eventsRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    const response = await realFetch(
      `http://127.0.0.1:${port}/events?from=${FROM.toISOString()}&to=${TO.toISOString()}`,
    );
    assert.equal(response.status, 200);
    return await response.json();
  } finally {
    server.close();
  }
}

describe('cancelled events', () => {
  beforeEach(() => store.clearEvents());
  afterEach(() => {
    globalThis.fetch = realFetch;
    store.clearEvents();
  });

  it('hides a cancelled event from the API and reminders while preserving its ICS status', async () => {
    const [cancelled, confirmed] = parseIcs(
      calendar(event('cancelled', 'STATUS:CANCELLED\n'), event('confirmed', 'STATUS:CONFIRMED\n')),
    );
    assert.equal(cancelled.status, 'CANCELLED');
    assert.match(serializeEvent({ ...cancelled, title: 'Renamed' }), /STATUS:CANCELLED/);
    store.setEventSilent({ ...cancelled, calendarId: 'cal', alarmMinutes: 15 });
    store.setEventSilent({ ...confirmed, calendarId: 'cal', alarmMinutes: 15 });

    assert.deepEqual(
      (await getEvents()).map((ev) => ev.uid),
      ['confirmed'],
    );
    assert.deepEqual(
      collectReminders(new Date('2026-08-17T09:40:00Z'), new Date('2026-08-17T09:50:00Z'), {
        timezone: 'UTC',
      }).map((reminder) => reminder.title),
      ['confirmed'],
    );
  });

  it('hides only the cancelled occurrence of a recurring series', async () => {
    const ics = calendar(
      event('series').replace('SUMMARY:series', 'RRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:series'),
      'BEGIN:VEVENT\nUID:series\nRECURRENCE-ID:20260824T100000Z\nSTATUS:CANCELLED\nEND:VEVENT',
    );
    for (const ev of parseIcs(ics)) store.setEventSilent({ ...ev, calendarId: 'cal' });

    const result = await getEvents();
    assert.deepEqual(
      result.map((ev) => ev.start),
      ['2026-08-17T10:00:00.000Z', '2026-08-31T10:00:00.000Z'],
    );
    assert.equal(store.getOverrides().length, 1);
  });

  it('refreshes a feed when only event status changes', async () => {
    let ics = calendar(event('meeting'));
    globalThis.fetch = async function fetchFeed() {
      return new Response(ics, { headers: { 'Content-Type': 'text/calendar' } });
    };
    const feed = { id: 'ics:work', name: 'Work', url: 'https://example.com/work.ics', color: '' };
    assert.equal(await syncIcsFeed(feed, new Date()), 1);
    assert.deepEqual(
      (await getEvents()).map((ev) => ev.title),
      ['meeting'],
    );

    ics = calendar(event('meeting', 'STATUS:CANCELLED\n'));
    assert.equal(await syncIcsFeed(feed, new Date()), 2);
    assert.deepEqual(await getEvents(), []);
  });

  it('hides a feed occurrence marked only by a Canceled: title', async () => {
    const ics = calendar(
      event('series').replace('SUMMARY:series', 'RRULE:FREQ=WEEKLY;COUNT=3\nSUMMARY:series'),
      'BEGIN:VEVENT\nUID:series\nRECURRENCE-ID:20260824T100000Z\nDTSTART:20260824T100000Z\nDTEND:20260824T110000Z\nSUMMARY:Canceled: series\nEND:VEVENT',
    );
    globalThis.fetch = async function fetchFeed() {
      return new Response(ics, { headers: { 'Content-Type': 'text/calendar' } });
    };
    const feed = { id: 'ics:work', name: 'Work', url: 'https://example.com/work.ics', color: '' };
    await syncIcsFeed(feed, new Date());

    assert.equal(store.getOverrides()[0].status, 'CANCELLED');
    assert.deepEqual(
      (await getEvents()).map((ev) => ev.start),
      ['2026-08-17T10:00:00.000Z', '2026-08-31T10:00:00.000Z'],
    );
  });
});
