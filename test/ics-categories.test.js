// CATEGORIES that arrive from a CalDAV server are user labels, except for the
// type markers Google's ICS export stamps on everything it writes.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseCategories, parseIcs, parseVtodo } = require('../server/caldav/parser');

/** Wrap a VEVENT body in the calendar envelope parseIcs expects. */
function ics(body) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', body, 'END:VCALENDAR'].join('\r\n');
}

describe('parseCategories', () => {
  it('keeps ordinary labels and trims them', () => {
    assert.deepEqual(parseCategories('Work, Family ,Travel'), ['Work', 'Family', 'Travel']);
  });

  it('drops Google type markers', () => {
    assert.deepEqual(parseCategories('http://schemas.google.com/g/2005#event'), []);
    assert.deepEqual(parseCategories('https://schemas.google.com/g/2005#task'), []);
  });

  it('keeps the real labels sitting next to a marker', () => {
    assert.deepEqual(parseCategories('Birthdays,http://schemas.google.com/g/2005#event'), [
      'Birthdays',
    ]);
  });

  it('keeps a label that merely mentions Google', () => {
    assert.deepEqual(parseCategories('Google Meet,schemas.google.com'), [
      'Google Meet',
      'schemas.google.com',
    ]);
  });

  it('treats a missing or empty value as no categories', () => {
    assert.deepEqual(parseCategories(undefined), []);
    assert.deepEqual(parseCategories(''), []);
    assert.deepEqual(parseCategories(' , '), []);
  });
});

describe('the marker never reaches an event or a task', () => {
  it('is dropped from a Google-exported VEVENT', () => {
    const [ev] = parseIcs(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:vera-1',
          'DTSTART;VALUE=DATE:20260901',
          'DTEND;VALUE=DATE:20260902',
          'SUMMARY:Vera Bursdag',
          'CATEGORIES:http://schemas.google.com/g/2005#event',
          'END:VEVENT',
        ].join('\r\n'),
      ),
      'cal-1',
      '/cal/vera.ics',
      'etag-1',
    );
    assert.equal(ev.title, 'Vera Bursdag');
    assert.deepEqual(ev.categories, []);
  });

  it('is dropped from a Google-exported VTODO', () => {
    const [task] = parseVtodo(
      ics(
        [
          'BEGIN:VTODO',
          'UID:todo-1',
          'SUMMARY:Buy cake',
          'CATEGORIES:Errands,http://schemas.google.com/g/2005#task',
          'END:VTODO',
        ].join('\r\n'),
      ),
      'list-1',
      '/list/todo.ics',
      'etag-2',
    );
    assert.deepEqual(task.categories, ['Errands']);
  });
});
