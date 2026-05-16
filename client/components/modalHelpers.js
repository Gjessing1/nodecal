/**
 * Shared modal UI helpers used by both the event modal (modalEditor.js)
 * and the task modal (taskModal.js).
 */

import { showDatePicker } from './datePicker.js';
import { esc } from '../app/utils.js';

/**
 * Build a date-picker display button and append it to wrapEl.
 * Shows formatted date when a value is set; emptyLabel when empty.
 * Syncs with the hidden inputEl via change events so NLP can update it.
 *
 * @param {HTMLInputElement} inputEl  - hidden <input type="hidden"> holding YYYY-MM-DD
 * @param {HTMLElement}      wrapEl   - container to append the button into
 * @param {{ emptyLabel?: string, onSelect?: function }} [opts]
 */
export function buildDatePickerButton(inputEl, wrapEl, opts = {}) {
  if (!inputEl || !wrapEl) return;
  const emptyLabel = opts.emptyLabel || 'Pick date';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'date-picker-btn';

  function refresh() {
    if (inputEl.value) {
      const d = new Date(inputEl.value + 'T00:00:00');
      btn.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } else {
      btn.textContent = emptyLabel;
    }
  }
  refresh();

  btn.addEventListener('click', () => {
    const cur = inputEl.value ? new Date(inputEl.value + 'T00:00:00') : new Date();
    showDatePicker(cur, selected => {
      const y  = selected.getFullYear();
      const mo = String(selected.getMonth() + 1).padStart(2, '0');
      const d  = String(selected.getDate()).padStart(2, '0');
      inputEl.value = `${y}-${mo}-${d}`;
      refresh();
      inputEl.dispatchEvent(new Event('change'));
      opts.onSelect?.(selected);
    });
  });
  inputEl.addEventListener('change', refresh);
  wrapEl.appendChild(btn);
}

/**
 * Mount a collapsible Location + URL row inside wrap.
 * Collapsed: shows "📍 loc  🔗 url" summary (or "+ Location / URL" if empty).
 * Expanded: shows two inputs + "− Remove / − Clear & collapse" button.
 *
 * @param {HTMLElement} wrap
 * @param {{ locId, urlId, initLoc?, initUrl?, showUrlLink? }} opts
 *   showUrlLink — event modal shows an "↗ Open" link; task modal does not
 */
export function mountLocationUrlSection(wrap, opts) {
  const { locId, urlId, initLoc = '', initUrl = '', showUrlLink = false } = opts;
  if (!wrap) return;

  function mount(expanded) {
    wrap.innerHTML = '';
    if (!expanded) {
      const locVal = wrap.closest('form, .modal-sheet')?.querySelector(`#${locId}`)?.value ?? initLoc;
      const urlVal = wrap.closest('form, .modal-sheet')?.querySelector(`#${urlId}`)?.value ?? initUrl;
      if (locVal || urlVal) {
        const row = document.createElement('div');
        row.className = 'collapsible-summary-row';
        const text = document.createElement('span');
        text.className = 'collapsible-summary-text';
        text.textContent = [locVal && `📍 ${locVal}`, urlVal && `🔗 ${urlVal}`].filter(Boolean).join('  ');
        const expandBtn = document.createElement('button');
        expandBtn.type = 'button'; expandBtn.className = 'add-field-btn';
        expandBtn.textContent = 'Edit';
        expandBtn.addEventListener('click', () => mount(true));
        row.append(text, expandBtn);
        wrap.appendChild(row);
      } else {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'add-field-btn';
        btn.textContent = '+ Location / URL';
        btn.addEventListener('click', () => mount(true));
        wrap.appendChild(btn);
      }
    } else {
      wrap.innerHTML = `
        <div class="modal-row">
          <div class="modal-field">
            <label>Location</label>
            <input type="text" id="${locId}" value="${esc(initLoc)}" placeholder="Location (optional)" autocomplete="off">
          </div>
          <div class="modal-field">
            <label>URL</label>
            <input type="url" id="${urlId}" value="${esc(initUrl)}" placeholder="https://…">
          </div>
        </div>`;
      const collapseBtn = document.createElement('button');
      collapseBtn.type = 'button'; collapseBtn.className = 'add-field-btn';
      collapseBtn.textContent = '− Remove';
      collapseBtn.addEventListener('click', () => mount(false));
      wrap.appendChild(collapseBtn);

      const locInput = wrap.querySelector(`#${locId}`);
      const urlInput = wrap.querySelector(`#${urlId}`);

      function updateCollapseLabel() {
        collapseBtn.textContent = (locInput?.value.trim() || urlInput?.value.trim())
          ? '− Clear & collapse' : '− Remove';
      }
      locInput?.addEventListener('input', updateCollapseLabel);
      urlInput?.addEventListener('input', updateCollapseLabel);

      if (showUrlLink && urlInput) {
        function updateUrlLink() {
          wrap.querySelector('.url-open-link')?.remove();
          if (urlInput.value.trim()) {
            const link = document.createElement('a');
            link.href = urlInput.value.trim();
            link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.textContent = '↗ Open'; link.className = 'url-open-link btn btn-ghost';
            urlInput.parentElement.appendChild(link);
          }
        }
        updateUrlLink();
        urlInput.addEventListener('input', updateUrlLink);
      }
    }
  }
  mount(!!(initLoc || initUrl));
}

/**
 * Mount a collapsible section toggle.
 * When hasContent is false: shows an expand button; bodyEl is hidden.
 * When hasContent is true: bodyEl is visible immediately; no button.
 * Clicking the button permanently reveals bodyEl for the session.
 *
 * @param {HTMLElement} toggleEl - container for the expand button
 * @param {HTMLElement} bodyEl   - the section to show/hide
 * @param {{ label: string, hasContent: boolean }} opts
 */
export function mountCollapsibleToggle(toggleEl, bodyEl, { label, hasContent }) {
  if (!toggleEl || !bodyEl) return;
  toggleEl.innerHTML = '';
  bodyEl.style.display = hasContent ? '' : 'none';
  if (!hasContent) {
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'add-field-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      bodyEl.style.display = '';
      toggleEl.innerHTML = '';
    });
    toggleEl.appendChild(btn);
  }
}

/**
 * Wire category chip rendering, text input, and autocomplete into existing DOM elements.
 * Renders initial chips immediately and handles all user interaction.
 * Returns a controller with getCategories() for use at save time.
 *
 * @param {HTMLElement}  chipsEl     - container element for chip spans
 * @param {HTMLInputElement} inputEl - text input for new category
 * @param {HTMLElement}  addBtnEl    - '+' button (may be null)
 * @param {HTMLElement}  autoListEl  - autocomplete <ul>
 * @param {string[]}     modalCats   - mutable array (mutated in place)
 * @param {string[]}     existingCats - all known categories for autocomplete
 * @param {{ onAdd?: function, onRemove?: function }} [callbacks]
 * @returns {{ getCategories: function(): string[] }}
 */
export function wireCategoryUI(chipsEl, inputEl, addBtnEl, autoListEl, modalCats, existingCats, callbacks = {}) {
  function renderChips() {
    chipsEl.innerHTML = '';
    for (const c of modalCats) {
      const chip = document.createElement('span');
      chip.className = 'task-cat-chip tm-cat-chip-rm';
      chip.textContent = c + ' ×';
      chip.dataset.cat = c;
      chip.addEventListener('click', () => {
        const idx = modalCats.indexOf(c);
        if (idx !== -1) { modalCats.splice(idx, 1); renderChips(); callbacks.onRemove?.(); }
      });
      chipsEl.appendChild(chip);
    }
  }
  renderChips();

  function addCategory(cat) {
    const c = cat.trim().toLowerCase();
    if (c && !modalCats.includes(c)) { modalCats.push(c); renderChips(); callbacks.onAdd?.(); }
  }

  function showAuto() {
    const q = inputEl.value.trim().toLowerCase();
    const matches = existingCats.filter(c => !modalCats.includes(c) && c.startsWith(q));
    if (!matches.length) { autoListEl.style.display = 'none'; return; }
    autoListEl.innerHTML = '';
    for (const cat of matches.slice(0, 8)) {
      const li = document.createElement('li');
      li.textContent = cat;
      li.addEventListener('mousedown', e => {
        e.preventDefault(); addCategory(cat); inputEl.value = ''; autoListEl.style.display = 'none';
      });
      autoListEl.appendChild(li);
    }
    autoListEl.style.display = '';
  }

  inputEl.addEventListener('input', showAuto);
  inputEl.addEventListener('blur', () => setTimeout(() => { autoListEl.style.display = 'none'; }, 150));
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addCategory(inputEl.value); inputEl.value = ''; autoListEl.style.display = 'none'; }
    if (e.key === 'Escape') autoListEl.style.display = 'none';
  });
  addBtnEl?.addEventListener('click', () => { addCategory(inputEl.value); inputEl.value = ''; autoListEl.style.display = 'none'; });

  return {
    getCategories() {
      const pending = inputEl.value.trim().toLowerCase();
      if (pending && !modalCats.includes(pending)) modalCats.push(pending);
      return [...modalCats];
    },
  };
}
