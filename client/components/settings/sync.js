import { button, field, help, numberInput, row } from './fields.js';

/**
 * Sync & storage: how often the client polls, how much of the calendar is kept
 * locally, and the escape hatch that throws the local copy away.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 * @param {{close: () => void, refresh: () => void}} ctx
 */
export function renderSyncSection(pane, draft, ctx) {
  pane.appendChild(
    row(
      field(
        'Auto-sync interval (minutes)',
        numberInput(
          draft.syncIntervalMinutes ?? 2,
          { min: 1, max: 60, step: 1, fallback: 2 },
          (v) => {
            draft.syncIntervalMinutes = v;
          },
        ),
      ),
      field(
        'Agenda days to show',
        numberInput(draft.agendaDays ?? 90, { min: 7, max: 365, step: 7, fallback: 90 }, (v) => {
          draft.agendaDays = v;
        }),
      ),
    ),
  );

  pane.appendChild(
    row(
      field(
        'Events history (days)',
        numberInput(draft.syncHistoryDays ?? 730, { min: 30, fallback: 730 }, (v) => {
          draft.syncHistoryDays = v;
        }),
      ),
      field(
        'Events future (days)',
        numberInput(draft.syncFutureDays ?? 0, { min: 0, fallback: 0 }, (v) => {
          draft.syncFutureDays = v;
        }),
        '0 means no limit — every future event is synced.',
      ),
    ),
  );

  const clear = button('Clear local cache', 'ghost', async (el) => {
    el.textContent = '↻ Syncing…';
    el.disabled = true;
    try {
      const res = await fetch('/api/sync/clear', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      ctx.close();
      ctx.refresh();
    } catch (err) {
      alert('Clear failed: ' + err.message);
    } finally {
      el.textContent = 'Clear local cache';
      el.disabled = false;
    }
  });

  const wrap = document.createElement('div');
  wrap.className = 'modal-field';
  wrap.append(clear, help('Discards the cached copy and re-syncs everything from the server.'));
  pane.appendChild(wrap);
}
