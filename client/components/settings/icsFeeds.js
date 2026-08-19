import { button, help, textInput } from './fields.js';

const ICS_PALETTE = [
  '#4a90d9',
  '#7ed321',
  '#d0021b',
  '#f5a623',
  '#50e3c2',
  '#9b59b6',
  '#e74c3c',
  '#2ecc71',
];

/**
 * Editor for the read-only .ics subscriptions listed in `draft.icsFeeds`.
 * Each feed becomes a pseudo-calendar on the server, so the colour picked here
 * is the colour its events get in every view.
 * @param {HTMLElement} host - container owned by this editor; re-rendered in place
 * @param {Record<string, any>} draft
 */
export function renderIcsFeeds(host, draft) {
  const feeds = draft.icsFeeds || (draft.icsFeeds = []);
  host.innerHTML = '';

  host.appendChild(help('Read-only external .ics URLs. They sync but can never be edited.'));

  feeds.forEach((feed, idx) => host.appendChild(buildFeedRow(host, draft, feed, idx)));

  host.appendChild(
    button('+ Add subscribed calendar', 'ghost', () => {
      feeds.push({
        id: newFeedId(),
        name: '',
        url: '',
        color: ICS_PALETTE[feeds.length % ICS_PALETTE.length],
      });
      renderIcsFeeds(host, draft);
    }),
  );
}

function newFeedId() {
  const suffix =
    crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `ics:${suffix}`;
}

function buildFeedRow(host, draft, feed, idx) {
  const row = document.createElement('div');
  row.className = 'settings-list-row';

  const color = document.createElement('input');
  color.type = 'color';
  color.className = 'settings-color-swatch';
  color.value = feed.color || ICS_PALETTE[idx % ICS_PALETTE.length];
  color.title = 'Calendar colour';
  color.addEventListener('input', () => {
    feed.color = color.value;
  });

  const fields = document.createElement('div');
  fields.className = 'settings-list-fields';
  fields.appendChild(
    textInput(feed.name, { placeholder: 'Name (e.g. Work)' }, (v) => {
      feed.name = v;
    }),
  );
  fields.appendChild(
    textInput(feed.url, { type: 'url', placeholder: 'https://…/calendar.ics' }, (v) => {
      feed.url = v;
    }),
  );

  const remove = button('×', 'ghost', () => {
    draft.icsFeeds.splice(idx, 1);
    renderIcsFeeds(host, draft);
  });
  remove.classList.add('settings-remove-btn');

  row.append(color, fields, remove);
  return row;
}

/** Feeds worth persisting — a half-filled row the user never finished is dropped. */
export function usableIcsFeeds(draft) {
  return (draft.icsFeeds || []).filter((f) => f.id && (f.url || '').trim());
}
