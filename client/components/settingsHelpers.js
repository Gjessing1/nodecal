import { state, setConfig } from '../app/state.js';
import { esc } from '../app/utils.js';
import { getAllCategories } from '../app/taskUtils.js';
import { getAllEventCategories } from '../app/eventUtils.js';

// ── Task sources ─────────────────────────────────────────────────────────────

export function renderTaskSourcesSection(sheet, cfg) {
  const section = sheet.querySelector('#s-task-sources-section');
  const sources = [...(state.taskSources || [])];
  const defUrl  = cfg.defaultTaskSource || sources[0]?.url || '';

  section.innerHTML = '';

  const headerLabel = document.createElement('div');
  headerLabel.className = 'modal-field';
  headerLabel.innerHTML = '<label>Task sources <span style="font-weight:normal;font-size:11px;color:var(--color-text-muted)">(select which calendar collection stores tasks)</span></label>';
  section.appendChild(headerLabel);

  const calOptions = state.calendars.map(c => ({ value: c.id, label: c.name }));
  const CUSTOM = '__custom__';

  const addRow = (src, idx) => {
    const isCustom = !calOptions.find(o => o.value === src.url);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:flex-start;margin-bottom:8px';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'task-src-default';
    radio.value = src.url || `__new__${idx}`;
    radio.checked = !!src.url && (src.url === defUrl || (!defUrl && idx === 0));
    radio.title = 'Default source for new tasks';
    radio.style.marginTop = '10px';
    radio.addEventListener('change', () => { state.config.defaultTaskSource = src.url; });

    const sel = document.createElement('select');
    sel.style.flex = '1';
    sel.innerHTML = calOptions.map(o =>
      `<option value="${esc(o.value)}" ${src.url === o.value ? 'selected' : ''}>${esc(o.label)}</option>`
    ).join('') + `<option value="${CUSTOM}" ${isCustom ? 'selected' : ''}>Custom URL…</option>`;

    const customInput = document.createElement('input');
    customInput.type = 'url';
    customInput.placeholder = 'https://…/user/tasks/';
    customInput.style.cssText = 'flex:1;display:' + (isCustom ? 'block' : 'none');
    customInput.value = isCustom ? src.url : '';

    const colWrap = document.createElement('div');
    colWrap.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:4px';
    colWrap.appendChild(sel);
    colWrap.appendChild(customInput);

    sel.addEventListener('change', () => {
      const val = sel.value;
      if (val === CUSTOM) {
        customInput.style.display = 'block';
        sources[idx].url = customInput.value.trim();
        sources[idx].name = 'Custom';
      } else {
        customInput.style.display = 'none';
        sources[idx].url = val;
        sources[idx].name = calOptions.find(o => o.value === val)?.label || '';
        radio.value = val;
        if (radio.checked) state.config.defaultTaskSource = val;
      }
    });
    customInput.addEventListener('input', () => {
      sources[idx].url = customInput.value.trim();
      radio.value = sources[idx].url;
      if (radio.checked) state.config.defaultTaskSource = sources[idx].url;
    });

    if (!isCustom && !src.name) {
      sources[idx].name = calOptions.find(o => o.value === src.url)?.label || src.url;
    }

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-ghost';
    removeBtn.style.cssText = 'padding:4px 8px;font-size:var(--font-size-sm);color:var(--color-danger);flex-shrink:0;margin-top:2px';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      sources.splice(idx, 1);
      state.taskSources = [...sources];
      renderTaskSourcesSection(sheet, { ...cfg, defaultTaskSource: state.config.defaultTaskSource });
    });

    row.appendChild(radio);
    row.appendChild(colWrap);
    row.appendChild(removeBtn);
    section.appendChild(row);
  };

  sources.forEach((src, i) => addRow(src, i));

  if (!sources.length && calOptions.length) {
    const firstCal = calOptions[0];
    sources.push({ url: firstCal.value, name: firstCal.label });
    state.taskSources = [...sources];
    addRow(sources[0], 0);
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-ghost';
  addBtn.style.cssText = 'font-size:var(--font-size-sm);padding:4px 12px;margin-bottom:var(--space-md)';
  addBtn.textContent = '+ Add task source';
  addBtn.addEventListener('click', () => {
    const firstCal = calOptions[0];
    sources.push({ url: firstCal?.value || '', name: firstCal?.label || '' });
    state.taskSources = [...sources];
    renderTaskSourcesSection(sheet, cfg);
  });
  section.appendChild(addBtn);

  state.taskSources = [...sources];
}

// ── Subscribed calendars (ICS feeds) ─────────────────────────────────────────

const ICS_PALETTE = ['#4a90d9', '#7ed321', '#d0021b', '#f5a623', '#50e3c2', '#9b59b6', '#e74c3c', '#2ecc71'];

export function renderIcsFeedsSection(sheet, cfg) {
  const section = sheet.querySelector('#s-ics-feeds-section');
  if (!section) return;
  const feeds = [...(state.config.icsFeeds || [])];
  state.config.icsFeeds = feeds; // keep state pointing at the working array

  section.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'modal-field';
  header.innerHTML = '<label>Subscribed calendars (ICS) <span style="font-weight:normal;font-size:11px;color:var(--color-text-muted)">(read-only external .ics URLs)</span></label>';
  section.appendChild(header);

  const addRow = (feed, idx) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = feed.color || ICS_PALETTE[idx % ICS_PALETTE.length];
    colorInput.style.cssText = 'flex:0 0 auto;width:34px;height:34px;padding:2px;border:none;background:none';
    colorInput.title = 'Calendar colour';
    colorInput.addEventListener('input', () => { feeds[idx].color = colorInput.value; });

    const fields = document.createElement('div');
    fields.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:4px';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Name (e.g. Work)';
    nameInput.value = feed.name || '';
    nameInput.addEventListener('input', () => { feeds[idx].name = nameInput.value; });

    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.placeholder = 'https://…/calendar.ics';
    urlInput.value = feed.url || '';
    urlInput.addEventListener('input', () => { feeds[idx].url = urlInput.value.trim(); });

    fields.append(nameInput, urlInput);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-ghost';
    removeBtn.style.cssText = 'padding:4px 8px;font-size:var(--font-size-sm);color:var(--color-danger);flex-shrink:0';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      feeds.splice(idx, 1);
      state.config.icsFeeds = [...feeds];
      renderIcsFeedsSection(sheet, cfg);
    });

    row.append(colorInput, fields, removeBtn);
    section.appendChild(row);
  };

  feeds.forEach((feed, i) => addRow(feed, i));

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn btn-ghost';
  addBtn.style.cssText = 'font-size:var(--font-size-sm);padding:4px 12px;margin-bottom:var(--space-md)';
  addBtn.textContent = '+ Add subscribed calendar';
  addBtn.addEventListener('click', () => {
    const id = 'ics:' + (crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    feeds.push({ id, name: '', url: '', color: ICS_PALETTE[feeds.length % ICS_PALETTE.length] });
    state.config.icsFeeds = [...feeds];
    renderIcsFeedsSection(sheet, cfg);
  });
  section.appendChild(addBtn);

  state.config.icsFeeds = [...feeds];
}

// ── Categories ───────────────────────────────────────────────────────────────

export function renderCategoriesSection(sheet, cfg) {
  const taskCats  = getAllCategories(state.tasks);
  const evCats    = getAllEventCategories(state.events);
  const section   = sheet.querySelector('#s-categories-section');

  if (!taskCats.length && !evCats.length) { section.innerHTML = ''; return; }

  section.innerHTML = '';
  if (taskCats.length) {
    section.appendChild(buildCollapsibleCatSection(sheet, 'Task categories', taskCats, 'hiddenCategories', cfg));
  }
  if (evCats.length) {
    section.appendChild(buildCollapsibleCatSection(sheet, 'Event categories', evCats, 'hiddenEventCategories', cfg));
  }
}

function buildCollapsibleCatSection(sheet, title, cats, configKey, cfg) {
  const hidden = cfg[configKey] || [];

  const wrapper = document.createElement('div');

  const header = document.createElement('div');
  header.className = 'modal-section-label settings-collapse-header';
  const arrow = document.createElement('span');
  arrow.className = 'settings-collapse-arrow';
  arrow.textContent = '▶';
  header.appendChild(arrow);
  header.appendChild(document.createTextNode(' ' + title));

  const listWrap = document.createElement('div');
  listWrap.className = 'modal-field settings-collapse-body';
  listWrap.style.gap = '6px';
  listWrap.hidden = true;

  header.addEventListener('click', () => {
    listWrap.hidden = !listWrap.hidden;
    arrow.textContent = listWrap.hidden ? '▶' : '▼';
  });

  for (const cat of cats) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 0';

    const name = document.createElement('span');
    name.className = 'task-cat-chip';
    name.textContent = cat;

    const isHidden = hidden.includes(cat);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost';
    btn.style.cssText = 'padding:2px 10px;font-size:var(--font-size-sm)';
    btn.textContent = isHidden ? 'Unhide' : 'Hide';
    btn.style.color = isHidden ? 'var(--color-accent)' : 'var(--color-text-muted)';

    btn.addEventListener('click', async () => {
      const current = state.config[configKey] || [];
      const next = isHidden ? current.filter(c => c !== cat) : [...current, cat];
      try {
        const res = await fetch('/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [configKey]: next }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        setConfig({ [configKey]: next });
        renderCategoriesSection(sheet, { ...cfg, [configKey]: next });
      } catch (err) {
        alert('Could not update: ' + err.message);
      }
    });

    row.appendChild(name);
    row.appendChild(btn);
    listWrap.appendChild(row);
  }

  wrapper.appendChild(header);
  wrapper.appendChild(listWrap);
  return wrapper;
}
