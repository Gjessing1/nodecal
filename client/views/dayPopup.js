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
  overlay.className = 'day-popup-overlay';
  overlay.addEventListener('click', () => overlay.remove());

  const panel = document.createElement('div');
  panel.className = 'day-popup-panel';
  panel.addEventListener('click', (e) => e.stopPropagation());

  const heading = document.createElement('div');
  heading.className = 'day-popup-heading';
  const headingLeft = document.createElement('div');
  headingLeft.className = 'day-popup-heading-left';
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
    wxSpan.className = 'day-popup-weather';
    wxSpan.textContent = wx;
    headingLeft.appendChild(wxSpan);
  }
  const closeBtn = document.createElement('button');
  closeBtn.className = 'day-popup-close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => overlay.remove());
  heading.appendChild(headingLeft);
  heading.appendChild(closeBtn);
  panel.appendChild(heading);

  if (!dayEvs.length && !tasks.length) {
    const empty = document.createElement('p');
    empty.className = 'day-popup-empty';
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
  footer.className = 'day-popup-footer';
  if (onNewEvent) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost day-popup-new-event';
    btn.textContent = '+ Event';
    btn.addEventListener('click', () => {
      overlay.remove();
      onNewEvent(new Date(day));
    });
    footer.appendChild(btn);
  }
  if (onNewTask) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-ghost day-popup-new-task';
    btn.textContent = '+ Task';
    btn.addEventListener('click', () => {
      overlay.remove();
      onNewTask(new Date(day));
    });
    footer.appendChild(btn);
  }
  if (onDayClick) {
    const btn = document.createElement('button');
    btn.className = 'day-popup-view-day btn btn-ghost';
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
