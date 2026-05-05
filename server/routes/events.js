const { Router } = require('express');
const { putEvent, deleteEvent } = require('../caldav/client');
const { serializeEvent } = require('../caldav/parser');
const store = require('../cache/store');

const router = Router();

router.get('/events', (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
  const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 90 * 86400000);
  const events = store.getEventsInRange(from, to).map(toApiShape);
  res.json(events);
});

router.post('/events', async (req, res) => {
  try {
    const { calendarId, title, start, end, allDay, description, location } = req.body;
    if (!calendarId || !title || !start) return res.status(400).json({ error: 'calendarId, title, start required' });

    const uid = crypto.randomUUID();
    const event = { uid, calendarId, title, start, end: end || start, allDay: !!allDay, description: description || '', location: location || '' };
    const ics = serializeEvent(event);
    const { href, etag } = await putEvent(calendarId, uid, ics);
    const stored = { ...event, href, etag };
    store.setEvent(stored);
    res.status(201).json(toApiShape(stored));
  } catch (err) {
    console.error('POST /events:', err.message);
    res.status(502).json({ error: err.message });
  }
});

router.put('/events/:id', async (req, res) => {
  try {
    const existing = store.getEvent(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const { title, start, end, allDay, description, location } = req.body;
    const updated = {
      ...existing,
      title: title ?? existing.title,
      start: start ?? existing.start,
      end: end ?? existing.end,
      allDay: allDay !== undefined ? !!allDay : existing.allDay,
      description: description !== undefined ? description : existing.description,
      location: location !== undefined ? location : existing.location,
    };
    const ics = serializeEvent(updated);
    const { href, etag } = await putEvent(existing.calendarId, existing.uid, ics, existing.etag);
    const stored = { ...updated, href, etag };
    store.setEvent(stored);
    res.json(toApiShape(stored));
  } catch (err) {
    console.error('PUT /events/:id:', err.message);
    res.status(502).json({ error: err.message });
  }
});

router.delete('/events/:id', async (req, res) => {
  try {
    const existing = store.getEvent(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    await deleteEvent(existing.href, existing.etag);
    store.removeEvent(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /events/:id:', err.message);
    res.status(502).json({ error: err.message });
  }
});

function toApiShape(ev) {
  return {
    id: ev.uid,
    title: ev.title,
    start: ev.start,
    end: ev.end,
    allDay: ev.allDay,
    description: ev.description,
    location: ev.location,
    calendarId: ev.calendarId,
  };
}

module.exports = router;
