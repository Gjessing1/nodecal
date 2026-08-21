import { state } from '../app/state.js';
import { weatherBadge } from '../app/utils.js';
import { dayEvents, dayTasks, buildEventRow, buildTaskRow } from './dayItems.js';

/**
 * Show the day popup overlay. The month grid, the week day headers and the week
 * all-day row all open it, and all three carry the same callback bag, so it is
 * taken whole rather than unpacked into eight positional arguments at each site.
 *
 * @param {Date} day
 * @param {string} dayStr - YYYY-MM-DD
 * @param {any} cb - the view's callback bag
 */
export function showDayPopup(day, dayStr, cb) {
  const { onEventClick, onDayClick, onTaskComplete, onTaskClick, onNewTask } = cb;
  // The popup's "+ Event" is the same intent as a long press on a day cell.
  const onNewEvent = cb.onLongPress;
  document.getElementById('month-day-popup')?.remove();

  const dayEvs = dayEvents(day, dayStr);
  const tasks = dayTasks(dayStr);

  const overlay = document.createElement('div');
  overlay.id = 'month-day-popup';
  overlay.className = 'fixed inset-0 z-[150] flex items-center justify-center bg-overlay-soft p-md';
  overlay.addEventListener('click', () => overlay.remove());

  const panel = document.createElement('div');
  panel.className =
    'max-h-[70dvh] w-full max-w-popup overflow-y-auto rounded-lg bg-bg p-md shadow-popup';
  panel.addEventListener('click', (e) => e.stopPropagation());

  const heading = document.createElement('div');
  heading.className = 'mb-md flex items-start justify-between gap-sm text-md font-semibold';
  const headingLeft = document.createElement('div');
  headingLeft.className = 'flex flex-col gap-2xs';
  headingLeft.textContent = day.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const wx = weatherBadge(
    dayStr,
    state.weather,
    state.config.weatherDaysMonth ?? state.config.weatherDays ?? 4,
  );
  if (wx) {
    const wxSpan = document.createElement('span');
    wxSpan.className = 'text-sm font-normal text-text-muted';
    wxSpan.textContent = wx;
    headingLeft.appendChild(wxSpan);
  }
  const closeBtn = document.createElement('button');
  closeBtn.className = 'px-xs text-md text-text-muted';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => overlay.remove());
  heading.appendChild(headingLeft);
  heading.appendChild(closeBtn);
  panel.appendChild(heading);

  if (!dayEvs.length && !tasks.length) {
    const empty = document.createElement('p');
    empty.className = 'py-sm text-sm text-text-muted';
    empty.textContent = 'Nothing scheduled';
    panel.appendChild(empty);
  }

  for (const ev of dayEvs) {
    panel.appendChild(
      buildEventRow(ev, (e) => {
        overlay.remove();
        onEventClick(e);
      }),
    );
  }

  for (const task of tasks) {
    panel.appendChild(
      buildTaskRow(
        task,
        onTaskComplete &&
          ((t) => {
            onTaskComplete(t);
            overlay.remove();
          }),
        (t) => {
          overlay.remove();
          onTaskClick?.(t);
        },
      ),
    );
  }

  const footer = document.createElement('div');
  footer.className = 'mt-sm flex gap-sm';
  if (onNewEvent) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost flex-1 text-sm text-accent';
    btn.textContent = '+ Event';
    btn.addEventListener('click', () => {
      overlay.remove();
      onNewEvent(new Date(day));
    });
    footer.appendChild(btn);
  }
  if (onNewTask) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost flex-1 text-sm text-accent';
    btn.textContent = '+ Task';
    btn.addEventListener('click', () => {
      overlay.remove();
      onNewTask(new Date(day));
    });
    footer.appendChild(btn);
  }
  if (onDayClick) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost flex-1 text-sm';
    btn.textContent = 'Day view →';
    btn.addEventListener('click', () => {
      overlay.remove();
      onDayClick(new Date(day));
    });
    footer.appendChild(btn);
  }
  if (footer.children.length) panel.appendChild(footer);

  overlay.appendChild(panel);
  document.getElementById('app')?.appendChild(overlay);
}
