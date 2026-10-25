import { button, field, groupLabel, help, textInput } from './fields.js';

/**
 * Integrations: bearer tokens for native clients such as the Glance widget,
 * which read `/api/glance/agenda` without the SSO login. Tokens are created and
 * revoked here right away; they are not part of the settings draft that Save writes.
 * @param {HTMLElement} pane
 */
export function renderIntegrationsSection(pane) {
  pane.appendChild(
    help(
      'A token lets an app outside the browser read your upcoming agenda (read-only). ' +
        'It is shown once, when it is created.',
    ),
  );

  const created = document.createElement('div');
  const list = document.createElement('div');
  list.className = 'modal-field';

  let label = 'Glance';
  const labelInput = textInput(label, { placeholder: 'Label (e.g. Glance phone)' }, (v) => {
    label = v;
  });
  const create = button('Create token', 'primary', async (el) => {
    el.disabled = true;
    try {
      const res = await fetch('/api/integrations/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showCreated(created, await res.json());
      await loadTokens(list);
    } catch (err) {
      created.replaceChildren(help(`Could not create a token: ${err.message}`));
    } finally {
      el.disabled = false;
    }
  });
  create.classList.add('settings-inline-btn');

  const createRow = document.createElement('div');
  createRow.className = 'settings-status-row';
  createRow.append(labelInput, create);
  pane.appendChild(field('New token', createRow));
  pane.appendChild(created);

  pane.appendChild(groupLabel('Active tokens'));
  pane.appendChild(list);
  loadTokens(list);
}

/**
 * The new token with a copy button. It is never retrievable again.
 * @param {HTMLElement} host
 * @param {{ token: string, label: string }} result
 */
function showCreated(host, result) {
  const value = document.createElement('input');
  value.type = 'text';
  value.readOnly = true;
  value.value = result.token;
  value.addEventListener('focus', () => value.select());

  const copy = button('Copy', 'ghost', async (el) => {
    try {
      await navigator.clipboard.writeText(result.token);
      el.textContent = 'Copied';
    } catch {
      value.select();
    }
  });
  copy.classList.add('settings-inline-btn');

  const row = document.createElement('div');
  row.className = 'settings-status-row';
  row.append(value, copy);
  const note = help(`Copy the token for “${result.label}” now; it will not be shown again.`);
  note.dataset.tone = 'ok';
  host.replaceChildren(field('', row), note);
}

/** @param {HTMLElement} list */
async function loadTokens(list) {
  list.replaceChildren(help('Loading…'));
  let tokens;
  try {
    const res = await fetch('/api/integrations/tokens');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    tokens = await res.json();
  } catch (err) {
    list.replaceChildren(help(`Could not load tokens: ${err.message}`));
    return;
  }
  if (!tokens.length) {
    list.replaceChildren(help('No tokens yet.'));
    return;
  }
  list.replaceChildren();
  for (const token of tokens) list.appendChild(tokenRow(list, token));
}

/**
 * @param {HTMLElement} list
 * @param {{ id: string, label: string, createdAt: string, lastUsedAt: string|null }} token
 */
function tokenRow(list, token) {
  const row = document.createElement('div');
  row.className = 'settings-list-row';

  const text = document.createElement('div');
  text.className = 'settings-list-fields';
  const name = document.createElement('strong');
  name.textContent = token.label;
  const used = token.lastUsedAt ? `last used ${formatWhen(token.lastUsedAt)}` : 'never used';
  text.append(name, help(`Created ${formatWhen(token.createdAt)} · ${used}`));

  const revoke = button('Revoke', 'ghost', async (el) => {
    if (!confirm(`Revoke “${token.label}”? Apps using it stop updating.`)) return;
    el.disabled = true;
    await fetch(`/api/integrations/tokens/${encodeURIComponent(token.id)}`, { method: 'DELETE' });
    await loadTokens(list);
  });
  revoke.classList.add('settings-remove-btn');

  row.append(text, revoke);
  return row;
}

/** @param {string} iso */
function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
