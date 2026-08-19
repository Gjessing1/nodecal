import { ALL_VIEWS, MAX_NAV_TABS } from './sections.js';
import { field, toggle } from './fields.js';

/** Navigation tabs the draft would produce: calendar views plus the Tasks tab. */
function navTabCount(draft) {
  return (draft.enabledViews || []).length + (draft.enableTasksView ? 1 : 0);
}

/**
 * Views & layout: which tabs exist, what they show, and week-number/weekend
 * decoration. The tab-count rules are enforced here rather than at save time so
 * the message lands next to the checkbox that broke them.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 */
export function renderViewsSection(pane, draft) {
  const visible = document.createElement('div');
  visible.className = 'modal-field';
  const visibleLabel = document.createElement('label');
  visibleLabel.textContent = 'Visible views';
  visible.appendChild(visibleLabel);

  for (const view of ALL_VIEWS) {
    const enabled = (draft.enabledViews || []).includes(view.id);
    visible.appendChild(
      toggle(view.label, enabled, (checked, input) => {
        // Rebuilt in canonical order — the nav tabs follow this list, and
        // toggling one off and on again must not reshuffle them.
        const chosen = new Set(draft.enabledViews || []);
        if (checked) chosen.add(view.id);
        else chosen.delete(view.id);
        const next = ALL_VIEWS.filter((v) => chosen.has(v.id)).map((v) => v.id);
        if (!next.length) {
          input.checked = true;
          alert('At least one view must be enabled.');
          return;
        }
        const previous = draft.enabledViews;
        draft.enabledViews = next;
        if (navTabCount(draft) > MAX_NAV_TABS) {
          draft.enabledViews = previous;
          input.checked = false;
          alert(`Maximum ${MAX_NAV_TABS} navigation tabs allowed. Disable another view first.`);
        }
      }),
    );
  }

  visible.appendChild(
    toggle('Tasks', draft.enableTasksView, (checked, input) => {
      draft.enableTasksView = checked;
      if (navTabCount(draft) > MAX_NAV_TABS) {
        draft.enableTasksView = false;
        input.checked = false;
        alert(`Maximum ${MAX_NAV_TABS} navigation tabs allowed. Uncheck a view first.`);
        return;
      }
      // 'tasks' is only a legal default while its tab exists.
      if (!checked && draft.defaultView === 'tasks') draft.defaultView = draft.enabledViews[0];
    }),
  );
  pane.appendChild(visible);

  pane.appendChild(
    buildToggleGroup(
      'Show tasks on views',
      [
        { key: 'showTasksOnAgenda', label: 'Agenda' },
        { key: 'showTasksOnDay', label: 'Day' },
        { key: 'showTasksOnWeek', label: 'Week' },
        { key: 'showTasksOnMonth', label: 'Month' },
      ],
      draft,
      'showTasksOnCalendar',
    ),
  );

  pane.appendChild(
    buildToggleGroup(
      'Show week numbers (ISO 8601)',
      [
        { key: 'showWeekNumbersDay', label: 'Day view' },
        { key: 'showWeekNumbersMonth', label: 'Month view' },
        { key: 'showWeekNumbersAgenda', label: 'Agenda view' },
      ],
      draft,
      'showWeekNumbers',
    ),
  );

  pane.appendChild(
    field(
      '',
      toggle('Highlight weekends', draft.showWeekendBg !== false, (checked) => {
        draft.showWeekendBg = checked;
      }),
    ),
  );
}

/**
 * A captioned set of per-view toggles. `summaryKey` is the older single flag the
 * per-view ones replaced: it seeds any unset toggle and stays true while at
 * least one view is on, so settings saved before the split keep working.
 */
function buildToggleGroup(title, entries, draft, summaryKey) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-field';
  const label = document.createElement('label');
  label.textContent = title;
  wrap.appendChild(label);

  for (const entry of entries) {
    const current = draft[entry.key] ?? draft[summaryKey];
    draft[entry.key] = !!current;
    wrap.appendChild(
      toggle(entry.label, current, (checked) => {
        draft[entry.key] = checked;
        draft[summaryKey] = entries.some((e) => draft[e.key]);
      }),
    );
  }
  return wrap;
}
