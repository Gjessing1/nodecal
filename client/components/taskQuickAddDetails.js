import { PRIORITY_LEVELS, PRIORITY_VALUES } from '../app/taskUtils.js';

/**
 * Less-used quick-add fields stay behind one disclosure beside the title.
 * @param {() => void} onFullEditor
 * @param {{sources: import('../app/state.js').TaskSource[], source: string|null, onSourceChange: (url: string) => void}} sourceOptions
 */
export function buildTaskQuickAddDetails(onFullEditor, sourceOptions) {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className =
    'flex size-touch shrink-0 items-center justify-center rounded-sm text-xl text-text-muted hover:text-accent';
  trigger.textContent = '⋯';
  trigger.setAttribute('aria-label', 'More task fields');
  trigger.setAttribute('aria-controls', 'task-quick-add-details');
  trigger.setAttribute('aria-expanded', 'false');

  const panel = document.createElement('div');
  panel.id = 'task-quick-add-details';
  panel.className =
    'task-quickadd-extra mt-xs hidden rounded-md border border-border bg-surface p-sm';
  const fields = document.createElement('div');
  fields.className = 'grid grid-cols-2 gap-sm';

  const priority = document.createElement('select');
  priority.setAttribute('aria-label', 'New task priority');
  priority.appendChild(new Option('No priority', 'none'));
  for (const level of PRIORITY_LEVELS) {
    if (level.key !== 'none') priority.appendChild(new Option(level.label, level.key));
  }
  fields.appendChild(labelled('Priority', priority));

  const reminder = document.createElement('select');
  reminder.setAttribute('aria-label', 'New task reminder');
  reminder.append(
    new Option('None', 'none'),
    new Option('Morning on due', 'on-due'),
    new Option('Evening on due', 'evening-due'),
    new Option('Morning before', 'morning-before'),
    new Option('Evening before', 'evening-before'),
  );
  fields.appendChild(labelled('Reminder', reminder));

  /** @type {HTMLSelectElement|null} */
  let source = null;
  if (sourceOptions.sources.length > 1) {
    source = document.createElement('select');
    source.setAttribute('aria-label', 'New task source');
    for (const item of sourceOptions.sources) {
      source.appendChild(new Option(item.name || item.url, item.url));
    }
    source.value = sourceOptions.source || '';
    source.addEventListener('change', function changeSource() {
      sourceOptions.onSourceChange(source.value);
    });
    const sourceField = labelled('Source', source);
    sourceField.classList.add('col-span-2');
    fields.appendChild(sourceField);
  }
  panel.appendChild(fields);

  const notes = document.createElement('textarea');
  notes.rows = 2;
  notes.className = 'w-full rounded-sm border border-border bg-bg px-sm py-xs text-sm';
  notes.setAttribute('aria-label', 'New task notes');
  const notesField = labelled('Notes', notes);
  notesField.classList.add('mt-xs');
  panel.appendChild(notesField);

  const fullEditor = document.createElement('button');
  fullEditor.type = 'button';
  fullEditor.className = 'mt-xs text-sm text-accent underline';
  fullEditor.textContent = 'Full editor…';
  fullEditor.addEventListener('click', onFullEditor);
  panel.appendChild(fullEditor);

  trigger.addEventListener('click', function toggleDetails() {
    const open = panel.classList.toggle('hidden') === false;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) priority.focus();
  });

  return {
    trigger,
    panel,
    setSource(url) {
      if (source) source.value = url || '';
    },
    read() {
      return {
        priority: PRIORITY_VALUES[priority.value] || undefined,
        taskReminder: reminder.value === 'none' ? undefined : reminder.value,
        description: notes.value.trim() || undefined,
      };
    },
  };
}

/**
 * @param {string} name
 * @param {HTMLElement} control
 */
function labelled(name, control) {
  const label = document.createElement('label');
  label.className = 'flex min-w-0 flex-col gap-2xs text-xs text-text-muted';
  const caption = document.createElement('span');
  caption.textContent = name;
  control.classList.add('min-w-0', 'text-sm');
  label.append(caption, control);
  return label;
}
