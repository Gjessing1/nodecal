import { state, calendarById } from '../app/state.js';
import { formatTime, localDateStr, getISOWeek, weatherBadge } from '../app/utils.js';
import { initLongPressCreate } from '../components/dnd.js';
import { getAllEventCategories } from '../app/eventUtils.js';
import { taskSourceVisible } from '../app/taskUtils.js';
import { modifiedTag } from './occurrenceMark.js';

const DAY_MS = 86400000;
const PAST_CHUNK_DAYS = 7;
const FILTER_CHIP_CLASSES =
  'shrink-0 whitespace-nowrap rounded-lg border border-border px-control py-pill-y text-sm text-text-muted transition-colors duration-100 aria-pressed:border-accent aria-pressed:bg-accent-light aria-pressed:text-accent';

// The scroll listener lives on the view container, which survives re-renders —
// keep a handle so each render can detach the previous one.
let scrollHandler = null;

/**
 * Render the agenda view into the given container element.
 * @param {HTMLElement} container
 * @param {(event: any) => void} onEventClick
 * @param {(task: any) => void} [onTaskClick]
 * @param {(task: any) => void} [onTaskComplete]
 * @param {(d: Date) => void} [onLongPress] - long-press on a day opens new event for that date
 */
export function renderAgenda(container, onEventClick, onTaskClick, onTaskComplete, onLongPress) {
  container.innerHTML = '';
  if (scrollHandler) {
    container.removeEventListener('scroll', scrollHandler);
    scrollHandler = null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const agendaDays = state.config.agendaDays ?? 90;
  // How many days before today are shown; grows in chunks via the "Earlier" button.
  let pastDays = 0;

  // ── Category filter ──────────────────────────────────────
  let activeCategoryFilter = '';

  const filterBar = document.createElement('div');
  filterBar.className =
    'sticky top-0 z-[5] flex shrink-0 items-center gap-xs overflow-x-auto border-b border-border bg-bg px-md py-xs [scrollbar-width:none] empty:hidden';

  function buildCatFilter() {
    filterBar.innerHTML = '';
    const hiddenEvCats = state.config.hiddenEventCategories || [];
    const visibleEvents = state.events.filter((ev) => !state.hiddenCalendars.has(ev.calendarId));
    const allCats = getAllEventCategories(visibleEvents).filter((c) => !hiddenEvCats.includes(c));
    if (!allCats.length) return;

    const label = document.createElement('span');
    label.className = 'shrink-0 text-sm text-text-muted';
    label.textContent = 'Filter:';
    filterBar.appendChild(label);

    const allChip = document.createElement('button');
    allChip.className = FILTER_CHIP_CLASSES;
    allChip.setAttribute('aria-pressed', String(!activeCategoryFilter));
    allChip.textContent = 'All';
    allChip.addEventListener('click', () => {
      activeCategoryFilter = '';
      buildCatFilter();
      renderDays();
    });
    filterBar.appendChild(allChip);

    for (const cat of allCats) {
      const chip = document.createElement('button');
      chip.className = FILTER_CHIP_CLASSES;
      chip.setAttribute('aria-pressed', String(activeCategoryFilter === cat));
      chip.textContent = cat;
      chip.addEventListener('click', () => {
        activeCategoryFilter = activeCategoryFilter === cat ? '' : cat;
        buildCatFilter();
        renderDays();
      });
      filterBar.appendChild(chip);
    }
  }
  buildCatFilter();
  container.appendChild(filterBar);

  // ── Past days ────────────────────────────────────────────
  const earlierBtn = document.createElement('button');
  earlierBtn.type = 'button';
  earlierBtn.className =
    'mx-auto mb-xs block rounded-lg border border-border bg-surface px-md py-xs text-sm text-text-muted';
  earlierBtn.textContent = '↑ Earlier';
  earlierBtn.addEventListener('click', loadEarlier);
  container.appendChild(earlierBtn);

  // ── Day groups ───────────────────────────────────────────
  const dayContainer = document.createElement('div');
  container.appendChild(dayContainer);

  const todayChip = document.createElement('button');
  todayChip.type = 'button';
  todayChip.className =
    'fixed bottom-[calc(var(--nav-height)+var(--spacing-xl)+var(--spacing-lg)+var(--app-safe-area-bottom))] left-1/2 z-40 -translate-x-1/2 rounded-lg bg-accent px-md py-xs text-sm font-semibold text-on-accent shadow-floating hidden';
  todayChip.textContent = 'Today';
  todayChip.addEventListener('click', scrollToToday);
  container.appendChild(todayChip);

  function todayEl() {
    return dayContainer.querySelector('.agenda-group.is-today');
  }

  // Prepending days shifts everything down — keep today's group visually still.
  function loadEarlier() {
    const before = todayEl()?.getBoundingClientRect().top ?? 0;
    pastDays += PAST_CHUNK_DAYS;
    renderDays();
    const after = todayEl()?.getBoundingClientRect().top ?? 0;
    container.scrollTop += after - before;
    updateTodayChip();
  }

  function scrollToToday() {
    const el = todayEl();
    if (!el) return;
    const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' });
  }

  function updateTodayChip() {
    const el = todayEl();
    if (!el) {
      todayChip.classList.add('hidden');
      return;
    }
    const view = container.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const above = rect.bottom < view.top;
    const below = rect.top > view.bottom;
    todayChip.textContent = above ? '↑ Today' : '↓ Today';
    todayChip.classList.toggle('hidden', !above && !below);
  }

  scrollHandler = updateTodayChip;
  container.addEventListener('scroll', scrollHandler, { passive: true });

  function renderDays() {
    const fragments = [];
    for (let i = -pastDays; i < agendaDays; i++) {
      const raw = new Date(today.getTime() + i * DAY_MS);
      const day = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
      const dayEnd = new Date(day.getTime() + DAY_MS);
      const str = localDateStr(day);
      let dayEvents = state.events.filter((ev) => {
        if (state.hiddenCalendars.has(ev.calendarId)) return false;
        if (ev.allDay) return ev.start.slice(0, 10) <= str && ev.end.slice(0, 10) > str;
        return new Date(ev.start) < dayEnd && new Date(ev.end) > day;
      });
      if (activeCategoryFilter) {
        dayEvents = dayEvents.filter((ev) => (ev.categories || []).includes(activeCategoryFilter));
      }
      const dayTasks =
        (state.config.showTasksOnAgenda ?? state.config.showTasksOnCalendar)
          ? state.tasks.filter(
              (t) =>
                t.due === str &&
                t.status !== 'COMPLETED' &&
                taskSourceVisible(t, state.hiddenCalendars),
            )
          : [];

      const isToday = i === 0;
      const header = document.createElement('div');
      header.className = 'agenda-group px-md' + (isToday ? ' is-today' : '');
      if (i < 0) header.classList.add('opacity-70');

      const dateEl = document.createElement('div');
      dateEl.className =
        'border-t border-border pt-md pb-sm text-sm font-semibold tracking-wider text-text-muted uppercase';
      if (isToday) dateEl.classList.add('text-today-text');
      dateEl.textContent = formatDayHeader(day, isToday);
      header.appendChild(dateEl);

      if (dayEvents.length > 0 || dayTasks.length > 0) {
        for (const ev of dayEvents) {
          header.appendChild(buildEventCard(ev, onEventClick));
        }
        for (const task of dayTasks) {
          header.appendChild(buildTaskCard(task, onTaskClick, onTaskComplete));
        }
      }

      if (onLongPress) {
        const capturedDay = new Date(day);
        initLongPressCreate(header, {
          skipSelector: '.event-card,.task-check',
          onLongPress() {
            onLongPress(capturedDay);
          },
        });
      }

      fragments.push(header);
    }
    dayContainer.replaceChildren(...fragments);
  }
  renderDays();
}

function buildEventCard(ev, onClick) {
  const cal = calendarById(ev.calendarId);
  const color = cal?.color || '#4a90d9';

  const card = document.createElement('div');
  card.className =
    'event-card mb-xs flex cursor-pointer items-start gap-sm rounded-sm p-sm [-webkit-tap-highlight-color:transparent] active:bg-surface';
  card.dataset.id = ev.id;

  const dot = document.createElement('div');
  dot.className = 'mt-event-dot-offset size-control shrink-0 rounded-full';
  dot.style.background = color;

  const info = document.createElement('div');
  info.className = 'min-w-0 flex-1';

  const title = document.createElement('div');
  title.className = 'truncate font-medium';
  title.textContent = ev.title;

  const time = document.createElement('div');
  time.className = 'text-sm text-text-muted';
  time.textContent = ev.allDay
    ? 'All day'
    : formatTime(new Date(ev.start), state.config.timeFormat, state.config.timezone) +
      ' – ' +
      formatTime(new Date(ev.end), state.config.timeFormat, state.config.timezone);

  const edited = modifiedTag(ev);
  if (edited) time.append(' · ', edited);

  info.appendChild(title);
  info.appendChild(time);
  card.appendChild(dot);
  card.appendChild(info);
  card.addEventListener('click', () => onClick(ev));
  return card;
}

function buildTaskCard(task, onTaskClick, onTaskComplete) {
  const card = document.createElement('div');
  card.className =
    'event-card mb-xs flex cursor-pointer items-start gap-sm rounded-sm p-sm opacity-85 [-webkit-tap-highlight-color:transparent] active:bg-surface';

  const check = document.createElement('button');
  check.className = 'task-check' + (task.status === 'COMPLETED' ? ' checked' : '');
  check.setAttribute(
    'aria-label',
    task.status === 'COMPLETED' ? 'Mark incomplete' : 'Complete task',
  );
  if (onTaskComplete) {
    check.addEventListener('click', (e) => {
      e.stopPropagation();
      onTaskComplete(task);
    });
  } else {
    check.disabled = true;
    check.title = 'Unavailable offline';
  }

  const info = document.createElement('div');
  info.className = 'min-w-0 flex-1 cursor-pointer';
  if (onTaskClick) info.addEventListener('click', () => onTaskClick(task));

  const title = document.createElement('div');
  title.className = 'truncate font-medium';
  title.textContent = task.title;

  info.appendChild(title);
  card.appendChild(check);
  card.appendChild(info);
  return card;
}

function formatDayHeader(date, isToday) {
  const isMonday = date.getDay() === 1;
  const wn =
    (state.config.showWeekNumbersAgenda ?? state.config.showWeekNumbers) && isMonday
      ? ` · W${getISOWeek(date)}`
      : '';
  const agendaWxDays = state.config.weatherDaysAgenda ?? 1;
  const wx = weatherBadge(localDateStr(date), state.weather, agendaWxDays);
  const wxTag = wx ? ` · ${wx}` : '';
  const long = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (isToday) return 'Today — ' + long + wn + wxTag;
  const tomorrow = new Date(Date.now() + DAY_MS);
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow — ' + long + wn + wxTag;
  const yesterday = new Date(Date.now() - DAY_MS);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday — ' + long + wn + wxTag;
  return long + wn + wxTag;
}
