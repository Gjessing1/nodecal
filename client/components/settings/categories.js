import { state } from '../../app/state.js';
import { getAllCategories } from '../../app/taskUtils.js';
import { getAllEventCategories } from '../../app/eventUtils.js';
import { button, help } from './fields.js';

/**
 * Categories: hide a task or event category from every view. Event and task
 * categories are deliberately separate lists — they never share a namespace.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 */
export function renderCategoriesSection(pane, draft) {
  const taskCats = getAllCategories(state.tasks);
  const eventCats = getAllEventCategories(state.events);

  if (!taskCats.length && !eventCats.length) {
    pane.appendChild(help('No categories yet. They appear here once events or tasks use them.'));
    return;
  }

  if (taskCats.length) {
    pane.appendChild(buildCategoryList('Task categories', taskCats, 'hiddenCategories', draft));
  }
  if (eventCats.length) {
    pane.appendChild(
      buildCategoryList('Event categories', eventCats, 'hiddenEventCategories', draft),
    );
  }
}

function buildCategoryList(title, cats, configKey, draft) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-field';

  const label = document.createElement('label');
  label.textContent = title;
  wrap.appendChild(label);

  for (const cat of cats) {
    wrap.appendChild(buildCategoryRow(cat, configKey, draft));
  }
  return wrap;
}

function buildCategoryRow(cat, configKey, draft) {
  const row = document.createElement('div');
  row.className = 'settings-category-row';

  const chip = document.createElement('span');
  chip.className = 'task-cat-chip';
  chip.textContent = cat;

  const toggleBtn = button('', 'ghost', (el) => {
    const current = draft[configKey] || [];
    const hidden = current.includes(cat);
    draft[configKey] = hidden ? current.filter((c) => c !== cat) : [...current, cat];
    paint(el);
  });
  paint(toggleBtn);

  function paint(el) {
    const hidden = (draft[configKey] || []).includes(cat);
    el.textContent = hidden ? 'Unhide' : 'Hide';
    el.classList.toggle('settings-cat-hidden', hidden);
  }

  row.append(chip, toggleBtn);
  return row;
}
