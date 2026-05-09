const { Router } = require('express');
const { putTask, deleteTask, getEffectiveTasksUrl, getDefaultTaskSourceUrl, getEffectiveTasksSources } = require('../caldav/client');
const { serializeTask } = require('../caldav/parser');
const { computeNextDue } = require('../caldav/recurrence');
const store = require('../cache/store');

const router = Router();

// ── GET /tasks ────────────────────────────────────────────

router.get('/tasks', (req, res) => {
  res.json(store.getTasks().map(toApiShape));
});

// ── GET /task-sources ─────────────────────────────────────

router.get('/task-sources', (req, res) => {
  res.json(getEffectiveTasksSources());
});

// ── POST /tasks ───────────────────────────────────────────

router.post('/tasks', async (req, res) => {
  const sources = getEffectiveTasksSources();
  if (!sources.length) return res.status(503).json({ error: 'Tasks CalDAV URL not configured' });

  const { title, due, description, categories, rrule, xRecurringType, xRecurringInterval, taskReminder, source } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });

  const targetSrc = sources.find(s => s.url === source) || sources[0];

  try {
    const uid = crypto.randomUUID();
    const now = new Date().toISOString();
    const task = {
      uid,
      type: 'task',
      title,
      description: description || '',
      status: 'NEEDS-ACTION',
      due: due || null,
      completed: null,
      categories: categories || [],
      rrule: rrule || null,
      xRecurringType: xRecurringType || null,
      xRecurringInterval: xRecurringInterval || null,
      taskReminder: taskReminder || null,
      createdAt: now,
      source: targetSrc.url,
      sourceName: targetSrc.name,
    };
    const ics = serializeTask(task);
    const { href, etag } = await putTask(targetSrc.url, uid, ics);
    const stored = { ...task, href, etag, localModifiedAt: now, lastSyncedAt: now };
    store.setTask(stored);
    res.status(201).json(toApiShape(stored));
  } catch (err) {
    console.error('POST /tasks:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── PUT /tasks/:id ────────────────────────────────────────

router.put('/tasks/:id', async (req, res) => {
  const tasksUrl = getEffectiveTasksUrl();
  if (!tasksUrl) return res.status(503).json({ error: 'Tasks CalDAV URL not configured' });

  try {
    const existing = store.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const allowed = ['title', 'due', 'description', 'categories', 'rrule', 'xRecurringType', 'xRecurringInterval', 'status', 'completed', 'taskReminder'];
    const changes = {};
    for (const k of allowed) {
      if (k in req.body) changes[k] = req.body[k];
    }

    const updated = { ...existing, ...changes };
    const ics = serializeTask(updated);
    const { href, etag } = await putTask(tasksUrl, existing.uid, ics, existing.etag);
    const now = new Date().toISOString();
    const stored = { ...updated, href, etag, localModifiedAt: now, lastSyncedAt: now };
    store.setTask(stored);
    res.json(toApiShape(stored));
  } catch (err) {
    console.error('PUT /tasks/:id:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── DELETE /tasks/:id ─────────────────────────────────────

router.delete('/tasks/:id', async (req, res) => {
  const tasksUrl = getEffectiveTasksUrl();
  if (!tasksUrl) return res.status(503).json({ error: 'Tasks CalDAV URL not configured' });

  try {
    const existing = store.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    await deleteTask(existing.href, existing.etag);
    store.removeTask(existing.uid);
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /tasks/:id:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── POST /tasks/:id/complete ──────────────────────────────

router.post('/tasks/:id/complete', async (req, res) => {
  const tasksUrl = getEffectiveTasksUrl();
  if (!tasksUrl) return res.status(503).json({ error: 'Tasks CalDAV URL not configured' });

  try {
    const task = store.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const completionDate = new Date();
    const isRecurring = !!(task.rrule || task.xRecurringType);
    let updated;

    if (isRecurring) {
      const nextDue = computeNextDue(task, completionDate);
      updated = {
        ...task,
        status: 'NEEDS-ACTION',
        due: nextDue ? nextDue.toISOString().slice(0, 10) : task.due,
        completed: null,
      };
    } else {
      updated = {
        ...task,
        status: 'COMPLETED',
        completed: completionDate.toISOString(),
      };
    }

    const ics = serializeTask(updated);
    const { href, etag } = await putTask(tasksUrl, task.uid, ics, task.etag);
    const now = new Date().toISOString();
    const stored = { ...updated, href, etag, localModifiedAt: now, lastSyncedAt: now };
    store.setTask(stored);
    res.json(toApiShape(stored));
  } catch (err) {
    console.error('POST /tasks/:id/complete:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────

function toApiShape(task) {
  return {
    id: task.uid,
    uid: task.uid,
    title: task.title,
    description: task.description || '',
    status: task.status || 'NEEDS-ACTION',
    due: task.due || null,
    completed: task.completed || null,
    important: (task.categories || []).includes('important'),
    categories: task.categories || [],
    recurring: !!(task.rrule || task.xRecurringType),
    recurringType: task.xRecurringType ? 'after-completion' : (task.rrule ? 'rrule' : null),
    recurringInterval: task.xRecurringInterval || null,
    rrule: task.rrule || null,
    createdAt: task.createdAt || null,
    source: task.source || null,
    sourceName: task.sourceName || null,
    taskReminder: task.taskReminder || null,
  };
}

module.exports = router;
