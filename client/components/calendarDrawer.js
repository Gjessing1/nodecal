import { state } from '../app/state.js';

let overlay, onToggleCb;

export function initCalendarDrawer(onToggle) {
  overlay = document.getElementById('cal-drawer-overlay');
  onToggleCb = onToggle;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDrawer(); });
}

export function openDrawer() {
  renderList();
  overlay.classList.remove('hidden');
}

export function closeDrawer() {
  overlay.classList.add('hidden');
}

function renderList() {
  const list = document.getElementById('cal-list');
  list.innerHTML = '';
  for (const cal of state.calendars) {
    const item = document.createElement('label');
    item.className = 'cal-item';

    const swatch = document.createElement('span');
    swatch.className = 'cal-swatch';
    swatch.style.background = cal.color;

    const name = document.createElement('span');
    name.className = 'cal-name';
    name.textContent = cal.name;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'cal-checkbox';
    checkbox.checked = !state.hiddenCalendars.has(cal.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.hiddenCalendars.delete(cal.id);
      else state.hiddenCalendars.add(cal.id);
      onToggleCb();
    });

    item.appendChild(swatch);
    item.appendChild(name);
    item.appendChild(checkbox);
    list.appendChild(item);
  }
}
