import { state } from '../../app/state.js';
import { button, help } from './fields.js';

const CUSTOM = '__custom__';

/**
 * Editor for `draft.taskSources` — the calendar collections the server pulls
 * VTODOs from. The radio in each row picks `draft.defaultTaskSource`, the
 * collection quick-add writes to unless the active profile overrides it.
 * @param {HTMLElement} host - container owned by this editor; re-rendered in place
 * @param {Record<string, any>} draft
 */
export function renderTaskSources(host, draft) {
  const sources = draft.taskSources || (draft.taskSources = []);
  const calOptions = state.calendars
    .filter((c) => !c.readOnly)
    .map((c) => ({ value: c.id, label: c.name }));

  // A first run has no configured source; seed it with the first calendar so the
  // Tasks tab has somewhere to write instead of silently failing.
  if (!sources.length && calOptions.length) {
    sources.push({ url: calOptions[0].value, name: calOptions[0].label });
  }
  // The first row shows as default when nothing is set; write that back so an
  // untouched list still saves the source it is displaying.
  if (!sources.some((s) => s.url === draft.defaultTaskSource)) {
    draft.defaultTaskSource = sources[0]?.url || '';
  }

  host.innerHTML = '';
  host.appendChild(help('Which calendar collections store tasks. The dot marks the default.'));

  sources.forEach((src, idx) =>
    host.appendChild(buildSourceRow(host, draft, calOptions, src, idx)),
  );

  host.appendChild(
    button('+ Add task source', 'ghost', () => {
      const first = calOptions[0];
      sources.push({ url: first?.value || '', name: first?.label || '' });
      renderTaskSources(host, draft);
    }),
  );
}

function buildSourceRow(host, draft, calOptions, src, idx) {
  const defaultUrl = draft.defaultTaskSource || draft.taskSources[0]?.url || '';
  const isCustom = !calOptions.some((o) => o.value === src.url);

  const row = document.createElement('div');
  row.className = 'settings-list-row settings-list-row-top';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'task-src-default';
  radio.className = 'settings-default-radio';
  radio.checked = !!src.url && (src.url === defaultUrl || (!defaultUrl && idx === 0));
  radio.title = 'Default source for new tasks';
  radio.addEventListener('change', () => {
    draft.defaultTaskSource = src.url;
  });

  const sel = document.createElement('select');
  for (const opt of calOptions) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    option.selected = src.url === opt.value;
    sel.appendChild(option);
  }
  const customOption = document.createElement('option');
  customOption.value = CUSTOM;
  customOption.textContent = 'Custom URL…';
  customOption.selected = isCustom;
  sel.appendChild(customOption);

  const custom = document.createElement('input');
  custom.type = 'url';
  custom.placeholder = 'https://…/user/tasks/';
  custom.value = isCustom ? src.url : '';
  custom.hidden = !isCustom;

  sel.addEventListener('change', () => {
    if (sel.value === CUSTOM) {
      custom.hidden = false;
      src.url = custom.value.trim();
      src.name = 'Custom';
    } else {
      custom.hidden = true;
      src.url = sel.value;
      src.name = calOptions.find((o) => o.value === sel.value)?.label || '';
    }
    if (radio.checked) draft.defaultTaskSource = src.url;
  });
  custom.addEventListener('input', () => {
    src.url = custom.value.trim();
    if (radio.checked) draft.defaultTaskSource = src.url;
  });

  // A source stored without a name (older settings) shows as its URL otherwise.
  if (!isCustom && !src.name) {
    src.name = calOptions.find((o) => o.value === src.url)?.label || src.url;
  }

  const fields = document.createElement('div');
  fields.className = 'settings-list-fields';
  fields.append(sel, custom);

  const remove = button('×', 'ghost', () => {
    draft.taskSources.splice(idx, 1);
    renderTaskSources(host, draft);
  });
  remove.classList.add('settings-remove-btn');

  row.append(radio, fields, remove);
  return row;
}
