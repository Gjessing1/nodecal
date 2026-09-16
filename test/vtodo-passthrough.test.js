// Writing a task back must not strip what other clients put in the VTODO:
// only the properties whose field changed are regenerated.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseVtodo, serializeTask } = require('../server/caldav/vtodo');

/** @param {string[]} todo - VTODO body lines, without BEGIN/END */
function calendar(todo, extra = []) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Other client//EN',
    ...extra,
    'BEGIN:VTODO',
    ...todo,
    'END:VTODO',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** The VTODO's lines as written, unfolded. */
function todoLines(ics) {
  const lines = ics.replace(/\r\n[ \t]/g, '').split('\r\n');
  return lines.slice(lines.indexOf('BEGIN:VTODO') + 1, lines.indexOf('END:VTODO'));
}

const OSLO = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Oslo',
  'BEGIN:STANDARD',
  'DTSTART:19701025T030000',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'END:STANDARD',
  'END:VTIMEZONE',
];

// A Tasks.org-style subtask with a timed due date, a start and an alarm.
const TASKS_ORG = calendar(
  [
    'UID:t1',
    'DTSTAMP:20260901T080000Z',
    'CREATED:20260901T080000Z',
    'LAST-MODIFIED:20260901T080000Z',
    'SUMMARY;LANGUAGE=nb:Kjøp melk',
    'DESCRIPTION:Task notes',
    'STATUS:NEEDS-ACTION',
    'PERCENT-COMPLETE:40',
    'RELATED-TO;RELTYPE=PARENT:parent-uid',
    'X-APPLE-SORT-ORDER:810000000',
    'CATEGORIES:Errands',
    'CATEGORIES:Home',
    'DTSTART;TZID=Europe/Oslo:20260916T090000',
    'DUE;TZID=Europe/Oslo:20260916T090000',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Alarm text',
    'TRIGGER;RELATED=END:-PT15M',
    'END:VALARM',
  ],
  OSLO,
);

describe('parseVtodo', () => {
  it('reads CREATED, X-APPLE-SORT-ORDER and every CATEGORIES line', () => {
    const [task] = parseVtodo(TASKS_ORG);
    assert.equal(task.createdAt, '2026-09-01T08:00:00.000Z');
    assert.equal(task.sortOrder, 810000000);
    assert.deepEqual(task.categories, ['Errands', 'Home']);
  });

  it('does not take a VALARM description for the task’s own', () => {
    const [task] = parseVtodo(
      calendar(['UID:t2', 'SUMMARY:A', 'BEGIN:VALARM', 'DESCRIPTION:Reminder', 'END:VALARM']),
    );
    assert.equal(task.description, '');
  });

  it('ignores a sort order that is not an integer', () => {
    const [task] = parseVtodo(calendar(['UID:t3', 'SUMMARY:A', 'X-APPLE-SORT-ORDER:1.5']));
    assert.equal(task.sortOrder, null);
  });
});

describe('serializeTask', () => {
  it('keeps every line it does not own when an unrelated field changes', () => {
    const [task] = parseVtodo(TASKS_ORG);
    const ics = serializeTask({ ...task, title: 'Buy milk' });
    const lines = todoLines(ics);

    assert.ok(lines.includes('SUMMARY:Buy milk'));
    for (const kept of [
      'CREATED:20260901T080000Z',
      'DESCRIPTION:Task notes',
      'STATUS:NEEDS-ACTION',
      'PERCENT-COMPLETE:40',
      'RELATED-TO;RELTYPE=PARENT:parent-uid',
      'X-APPLE-SORT-ORDER:810000000',
      'CATEGORIES:Errands',
      'CATEGORIES:Home',
      'DTSTART;TZID=Europe/Oslo:20260916T090000',
      'DUE;TZID=Europe/Oslo:20260916T090000',
    ]) {
      assert.ok(lines.includes(kept), `kept ${kept}`);
    }
    assert.ok(!lines.some((l) => l.startsWith('SUMMARY;LANGUAGE')), 'old title replaced');
    assert.ok(!lines.includes('DTSTAMP:20260901T080000Z'), 'restamped');
    assert.ok(!lines.includes('LAST-MODIFIED:20260901T080000Z'), 'restamped');
    // The alarm stays whole, after the task's own properties.
    const alarmAt = lines.indexOf('BEGIN:VALARM');
    assert.deepEqual(lines.slice(alarmAt), [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Alarm text',
      'TRIGGER;RELATED=END:-PT15M',
      'END:VALARM',
    ]);
    assert.ok(ics.includes('BEGIN:VTIMEZONE\r\nTZID:Europe/Oslo'), 'timezone kept for TZID');
  });

  it('writes a changed sort order and categories in place of the old lines', () => {
    const [task] = parseVtodo(TASKS_ORG);
    const lines = todoLines(
      serializeTask({ ...task, sortOrder: 42, categories: ['Errands', 'important'] }),
    );
    assert.ok(lines.includes('X-APPLE-SORT-ORDER:42'));
    assert.ok(!lines.includes('X-APPLE-SORT-ORDER:810000000'));
    assert.deepEqual(
      lines.filter((l) => l.startsWith('CATEGORIES')),
      ['CATEGORIES:Errands,important'],
    );
  });

  it('moves a timed DUE by whole days, keeping its time and zone', () => {
    const [task] = parseVtodo(TASKS_ORG);
    const lines = todoLines(serializeTask({ ...task, due: '2026-09-18' }));
    assert.ok(lines.includes('DUE;TZID=Europe/Oslo:20260918T090000'));
    assert.ok(lines.includes('DTSTART;TZID=Europe/Oslo:20260916T090000'), 'earlier start kept');
  });

  it('pulls DTSTART back when the due date moves before it', () => {
    const [task] = parseVtodo(TASKS_ORG);
    const lines = todoLines(serializeTask({ ...task, due: '2026-09-14' }));
    assert.ok(lines.includes('DUE;TZID=Europe/Oslo:20260914T090000'));
    assert.ok(lines.includes('DTSTART;TZID=Europe/Oslo:20260914T090000'));
  });

  it('gives DTSTART the value type of a date-only DUE', () => {
    const [task] = parseVtodo(
      calendar(['UID:t4', 'SUMMARY:A', 'DTSTART;TZID=Europe/Oslo:20260910T090000'], OSLO),
    );
    const lines = todoLines(serializeTask({ ...task, due: '2026-09-20' }));
    assert.ok(lines.includes('DUE;VALUE=DATE:20260920'));
    assert.ok(lines.includes('DTSTART;VALUE=DATE:20260910'));
  });

  it('swaps a DURATION for the DUE it cannot sit next to', () => {
    const [task] = parseVtodo(
      calendar(['UID:t5', 'SUMMARY:A', 'DTSTART;VALUE=DATE:20260910', 'DURATION:P2D']),
    );
    assert.equal(task.due, null);
    const lines = todoLines(serializeTask({ ...task, due: '2026-09-20' }));
    assert.ok(lines.includes('DUE;VALUE=DATE:20260920'));
    assert.ok(lines.includes('DTSTART;VALUE=DATE:20260910'));
    assert.ok(!lines.includes('DURATION:P2D'));
  });

  it('removes DUE but keeps DTSTART when the due date is cleared', () => {
    const [task] = parseVtodo(TASKS_ORG);
    const lines = todoLines(serializeTask({ ...task, due: null }));
    assert.ok(!lines.some((l) => l.startsWith('DUE')));
    assert.ok(lines.includes('DTSTART;TZID=Europe/Oslo:20260916T090000'));
  });

  it('writes a new task from its fields, stamping CREATED', () => {
    const lines = todoLines(
      serializeTask({
        uid: 'new',
        title: 'Fresh',
        status: 'NEEDS-ACTION',
        due: '2026-09-20',
        createdAt: '2026-09-16T10:00:00.000Z',
      }),
    );
    assert.ok(lines.includes('SUMMARY:Fresh'));
    assert.ok(lines.includes('STATUS:NEEDS-ACTION'));
    assert.ok(lines.includes('DUE;VALUE=DATE:20260920'));
    assert.ok(lines.includes('CREATED:20260916T100000Z'));
  });

  it('round-trips what it writes', () => {
    const [task] = parseVtodo(TASKS_ORG);
    const [again] = parseVtodo(serializeTask({ ...task, sortOrder: 7 }));
    assert.equal(again.sortOrder, 7);
    assert.equal(again.title, 'Kjøp melk');
    assert.deepEqual(again.rawVtodo.slice(-5), [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Alarm text',
      'TRIGGER;RELATED=END:-PT15M',
      'END:VALARM',
    ]);
  });
});
