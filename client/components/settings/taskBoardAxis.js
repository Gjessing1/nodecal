import { state } from '../../app/state.js';
import { todayStr } from '../../app/dayWindow.js';
import { fieldBuckets } from '../../app/boardBuckets.js';
import { button, textInput, toggle } from './fields.js';

const openEditors = new Set();

/**
 * Bucket preferences for one board axis. Pinning puts a bucket first; buckets
 * that appear later in task data still follow it in their natural order.
 * @param {import('../../app/boardBuckets.js').TaskBoard} board
 * @param {'columns'|'lanes'} axis
 * @param {Record<string, any>} draft
 * @param {() => void} rerender
 */
export function buildBoardAxisEditor(board, axis, draft, rerender) {
  const prop = axis === 'columns' ? 'columnConfig' : 'laneConfig';
  const config = board[prop] || { order: [], labels: {}, hideEmpty: false };
  board[prop] = config;
  const field = board[axis];
  if (!field) throw new Error('A board axis needs a field');
  const ctx = {
    today: todayStr(draft.timezone || state.config.timezone),
    hiddenCategories: draft.hiddenCategories || [],
    sources: (draft.taskSources || state.taskSources).filter(
      (source) => !state.hiddenCalendars.has(source.url),
    ),
  };
  const available = fieldBuckets(field, state.tasks, ctx);
  const byKey = new Map();
  for (const bucket of available) byKey.set(bucket.key, bucket);
  // Keep a pin editable when its category or source temporarily has no tasks.
  for (const key of config.order) {
    if (!byKey.has(key)) byKey.set(key, { key, label: key });
  }
  const buckets = [...byKey.values()];
  const ranks = new Map();
  for (let i = 0; i < config.order.length; i++) ranks.set(config.order[i], i);
  buckets.sort((a, b) => (ranks.get(a.key) ?? Infinity) - (ranks.get(b.key) ?? Infinity));

  const details = document.createElement('details');
  details.className = 'settings-board-axis';
  const editorKey = `${board.id}:${axis}`;
  details.open = openEditors.has(editorKey);
  details.addEventListener('toggle', () => {
    if (details.open) openEditors.add(editorKey);
    else openEditors.delete(editorKey);
  });
  const summary = document.createElement('summary');
  summary.textContent = axis === 'columns' ? 'Customize columns' : 'Customize lanes';
  details.appendChild(summary);
  details.appendChild(
    toggle('Hide empty buckets', config.hideEmpty, (checked) => {
      config.hideEmpty = checked;
    }),
  );

  for (const bucket of buckets) {
    const line = document.createElement('div');
    line.className = 'settings-board-bucket';
    const pinned = document.createElement('input');
    pinned.type = 'checkbox';
    pinned.checked = config.order.includes(bucket.key);
    pinned.setAttribute('aria-label', `Pin ${bucket.label}`);
    pinned.addEventListener('change', () => {
      if (pinned.checked) config.order.push(bucket.key);
      else config.order = config.order.filter((key) => key !== bucket.key);
      rerender();
    });
    const label = textInput(
      config.labels[bucket.key] || '',
      { placeholder: bucket.label },
      (value) => {
        if (value) config.labels[bucket.key] = value;
        else delete config.labels[bucket.key];
      },
    );
    label.setAttribute('aria-label', `Label for ${bucket.label}`);
    const up = button('↑', 'ghost', () => movePin(config.order, bucket.key, -1, rerender));
    const down = button('↓', 'ghost', () => movePin(config.order, bucket.key, 1, rerender));
    up.setAttribute('aria-label', `Move ${bucket.label} up`);
    down.setAttribute('aria-label', `Move ${bucket.label} down`);
    up.disabled = !pinned.checked || config.order.indexOf(bucket.key) === 0;
    down.disabled = !pinned.checked || config.order.indexOf(bucket.key) === config.order.length - 1;
    line.append(pinned, label, up, down);
    details.appendChild(line);
  }
  if (field === 'category') {
    const add = document.createElement('div');
    add.className = 'settings-board-bucket';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'New category bucket';
    input.setAttribute('aria-label', 'New category bucket');
    const addButton = button('Pin', 'ghost', () => {
      const key = input.value.trim();
      if (!key || byKey.has(key) || ctx.hiddenCategories.includes(key)) return;
      config.order.push(key);
      rerender();
    });
    add.append(input, addButton);
    details.appendChild(add);
  }
  const hint = document.createElement('p');
  hint.className = 'settings-help';
  hint.textContent =
    'Pinned buckets stay visible and come first. Use arrows to order them; other values follow automatically.';
  details.appendChild(hint);
  return details;
}

/** @param {string[]} order */
function movePin(order, key, direction, rerender) {
  const from = order.indexOf(key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= order.length) return;
  [order[from], order[to]] = [order[to], order[from]];
  rerender();
}
