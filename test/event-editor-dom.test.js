const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

if (process.env.NODECAL_SKIP_DOM_TESTS === '1') {
  test('event editor DOM tests need development dependencies', { skip: true }, () => {});
} else {
  const { JSDOM } = require('jsdom');
  let server;
  let dom;
  let state;
  let initModal;
  let openNewEventModal;
  let openEditEventModal;
  let closeModal;
  let saved;

  test.before(async () => {
    dom = new JSDOM(
      '<div id="modal-overlay" class="hidden"><div class="modal-sheet"></div></div>',
      {
        url: 'http://localhost/',
      },
    );
    for (const name of ['window', 'document', 'Event', 'HTMLElement', 'MutationObserver']) {
      globalThis[name] = dom.window[name];
    }
    const { createServer } = await import('vite');
    server = await createServer({
      configFile: false,
      root: path.join(__dirname, '..'),
      server: { middlewareMode: true },
      appType: 'custom',
    });
    ({ state } = await server.ssrLoadModule('/client/app/state.js'));
    ({ initModal, openNewEventModal, openEditEventModal, closeModal } = await server.ssrLoadModule(
      '/client/components/modalEditor.js',
    ));
    state.config.timezone = 'Europe/Oslo';
    state.config.defaultEventTime = '09:00';
    state.config.defaultEventDuration = 60;
    state.config.defaultCalendar = 'work';
    state.calendars = [
      { id: 'personal', name: 'Personal', color: '#334455' },
      { id: 'work', name: 'Work', color: '#556677' },
    ];
    initModal();
  });

  test.after(async () => {
    closeModal?.();
    await server?.close();
    dom?.window.close();
    for (const name of ['window', 'document', 'Event', 'HTMLElement', 'MutationObserver']) {
      delete globalThis[name];
    }
  });

  function field(id) {
    return globalThis.document.querySelector(id);
  }

  function openNew(instant, explicitTime = true) {
    saved = null;
    openNewEventModal(
      new Date(instant),
      (data) => {
        saved = data;
      },
      { explicitTime },
    );
  }

  function openEdit(event) {
    saved = null;
    openEditEventModal(
      event,
      (data) => {
        saved = data;
      },
      () => {},
    );
  }

  function changeDate(id, value) {
    field(id).value = value;
    field(id).dispatchEvent(new Event('change', { bubbles: true }));
  }

  test('new modal shows timed defaults and saves the chosen calendar', () => {
    openNew('2026-10-26T09:00:00Z');
    assert.equal(field('#f-start-date').value, '2026-10-26');
    assert.equal(field('#f-start-time').value, '10:00');
    assert.equal(field('#f-end-time').value, '11:00');
    assert.equal(field('#f-calendar').value, 'work');
    field('#f-title').value = 'Meeting';
    field('#f-calendar').value = 'personal';
    field('#f-save').click();
    assert.equal(saved.start, '2026-10-26T09:00:00.000Z');
    assert.equal(saved.end, '2026-10-26T10:00:00.000Z');
    assert.equal(saved.calendarId, 'personal');
    assert.equal(saved.allDay, false);
  });

  test('new modal uses the configured time on a future date', () => {
    openNew('2030-10-26T14:30:00Z', false);
    assert.equal(field('#f-start-date').value, '2030-10-26');
    assert.equal(field('#f-start-time').value, '09:00');
    assert.equal(field('#f-end-time').value, '10:00');
  });

  test('timed range becomes a multi-day all-day event and switches back', () => {
    openEdit({
      title: 'Trip',
      start: '2026-09-28T20:00:00Z',
      end: '2026-09-29T01:00:00Z',
      calendarId: 'personal',
    });
    assert.equal(field('#f-calendar').value, 'personal');
    field('#f-allday').checked = true;
    field('#f-allday').dispatchEvent(new Event('change'));
    assert.equal(field('#f-date').value, '2026-09-28');
    assert.equal(field('#f-date-last').value, '2026-09-29');
    field('#f-save').click();
    assert.equal(saved.start, '2026-09-28T00:00:00.000Z');
    assert.equal(saved.end, '2026-09-30T00:00:00.000Z');
    assert.equal(saved.allDay, true);

    openEdit({
      title: 'Trip',
      start: '2026-09-28T00:00:00Z',
      end: '2026-09-30T00:00:00Z',
      allDay: true,
      calendarId: 'personal',
    });
    assert.equal(field('#f-date-last').value, '2026-09-29');
    field('#f-allday').checked = false;
    field('#f-allday').dispatchEvent(new Event('change'));
    assert.equal(field('#f-start-date').value, '2026-09-28');
    assert.equal(field('#f-end-date').value, '2026-09-29');
    field('#f-save').click();
    assert.equal(saved.allDay, false);
    assert.equal(saved.start, '2026-09-28T07:00:00.000Z');
    assert.equal(saved.end, '2026-09-29T08:00:00.000Z');
  });

  test('all-day end before start keeps the modal open with an error', () => {
    openEdit({
      title: 'Trip',
      start: '2026-09-10T00:00:00Z',
      end: '2026-09-13T00:00:00Z',
      allDay: true,
      calendarId: 'personal',
    });
    assert.equal(field('#f-date-last').value, '2026-09-12');
    changeDate('#f-date-last', '2026-09-09');
    field('#f-save').click();
    assert.equal(saved, null);
    assert.equal(field('#f-when-error').textContent, 'The event ends before it starts.');
    assert.equal(field('#modal-overlay').className, '');
  });

  test('timed end before start keeps the modal open with an error', () => {
    openNew('2026-09-28T08:00:00Z');
    field('#f-title').value = 'Meeting';
    changeDate('#f-end-date', '2026-09-27');
    field('#f-save').click();
    assert.equal(saved, null);
    assert.equal(field('#f-when-error').textContent, 'The event must end after it starts.');
  });
}
