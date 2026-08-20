import {
  rememberEventCalendar,
  resolveEventCalendar,
  targetCalendars,
} from '../app/profileTargets.js';

// "To:" chip row above the calendar quick-add input, mirroring the tasks
// quick-add source row. It only appears when the active profile shows more than
// one writable calendar — in practice the Combined profile, where "which
// calendar does this go in?" has no obvious answer. Picking a chip makes it the
// profile's default, so the next event lands there without picking again.

export function renderQuickAddTarget() {
  const row = document.getElementById('cal-quickadd-target');
  if (!row) return;
  const cals = targetCalendars();
  row.innerHTML = '';
  if (cals.length < 2) {
    row.hidden = true;
    return;
  }
  row.hidden = false;

  const label = document.createElement('span');
  label.className = 'tasks-cat-filter-label';
  label.textContent = 'To:';
  row.appendChild(label);

  const current = resolveEventCalendar();
  for (const cal of cals) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tasks-date-shortcut' + (cal.id === current ? ' active' : '');
    btn.textContent = cal.name;
    btn.addEventListener('click', () => {
      rememberEventCalendar(cal.id);
      renderQuickAddTarget();
    });
    row.appendChild(btn);
  }
}
