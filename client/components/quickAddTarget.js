import {
  rememberEventCalendar,
  resolveEventCalendar,
  targetCalendars,
} from '../app/profileTargets.js';

const TARGET_CHIP_CLASSES =
  'rounded-lg border border-border px-chip-x py-xs text-sm text-text-muted transition-colors duration-100 aria-pressed:border-accent aria-pressed:bg-accent-light aria-pressed:text-accent';

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
  label.className = 'shrink-0 text-sm text-text-muted';
  label.textContent = 'To:';
  row.appendChild(label);

  const current = resolveEventCalendar();
  for (const cal of cals) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = TARGET_CHIP_CLASSES;
    btn.setAttribute('aria-pressed', String(cal.id === current));
    btn.textContent = cal.name;
    btn.addEventListener('click', () => {
      rememberEventCalendar(cal.id);
      renderQuickAddTarget();
    });
    row.appendChild(btn);
  }
}
