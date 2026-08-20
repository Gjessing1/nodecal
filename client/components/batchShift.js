// Batch shift: move every event carrying a category forwards or backwards at
// once. It lives apart from modalEditor.js because it is a self-contained tool
// with its own network call — the event modal only lends it a place to sit.

const UNITS = [
  ['1', 'day(s)'],
  ['7', 'week(s)'],
];

/**
 * Mount the collapsible batch-shift block into `container`.
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {() => string[]} opts.getCategories - categories currently on the event
 * @param {() => (string | null)} opts.getAnchorDate - "this and future" cut-off
 * @param {(message: string) => void} opts.onShifted - a shift actually landed
 * @returns {() => void} refresh - rebuild the rows after the categories change
 */
export function mountBatchShift(container, { getCategories, getAnchorDate, onShifted }) {
  const toggle = document.createElement('div');
  toggle.className = 'collapsible-field-wrap';
  const body = document.createElement('div');
  body.className = 'hidden';
  container.append(toggle, body);

  function refresh() {
    toggle.innerHTML = '';
    body.innerHTML = '';
    const cats = getCategories();
    if (!cats.length) return;
    toggle.appendChild(buildToggleButton(body));

    const hint = document.createElement('div');
    hint.className = 'batch-shift-status';
    hint.textContent = 'Tip: use a negative number to shift events backwards.';
    body.appendChild(hint);

    for (const cat of cats) {
      body.appendChild(buildRow(cat, { getAnchorDate, onShifted }));
    }
  }

  refresh();
  return refresh;
}

function buildToggleButton(body) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-field-btn';
  btn.textContent = '+ Batch shift';
  let open = false;
  btn.addEventListener('click', () => {
    open = !open;
    body.classList.toggle('hidden', !open);
    btn.textContent = open ? '− Batch shift' : '+ Batch shift';
  });
  return btn;
}

function buildRow(cat, { getAnchorDate, onShifted }) {
  const row = document.createElement('div');
  row.className = 'batch-shift-row';

  const catLabel = document.createElement('span');
  catLabel.className = 'task-cat-chip';
  catLabel.textContent = cat;

  const nInput = document.createElement('input');
  nInput.type = 'number';
  nInput.min = '-365';
  nInput.max = '365';
  nInput.title = 'Negative shifts backwards, positive shifts forwards';
  nInput.className = 'rec-interval-input';
  nInput.value = '7';

  const unitSel = document.createElement('select');
  unitSel.className = 'rec-freq-sel';
  for (const [value, label] of UNITS) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    unitSel.appendChild(o);
  }

  const futureBtn = document.createElement('button');
  futureBtn.type = 'button';
  futureBtn.className = 'btn btn-primary batch-shift-apply';
  futureBtn.textContent = 'Shift this and future events';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'btn btn-ghost batch-shift-apply';
  allBtn.textContent = 'Shift all';

  const status = document.createElement('span');
  status.className = 'batch-shift-status';

  async function doShift(withAnchor) {
    const n = parseInt(nInput.value) || 7;
    const multiplier = parseInt(unitSel.value) || 1;
    futureBtn.disabled = true;
    allBtn.disabled = true;
    status.textContent = '…';
    try {
      const body = { category: cat, shiftDays: n * multiplier };
      if (withAnchor) {
        const anchorDate = getAnchorDate();
        if (anchorDate) body.anchorDate = anchorDate;
      }
      const res = await fetch('/api/events/batch-shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      if (data.total === 0) {
        status.textContent = '✗ No events found';
      } else if (!data.shifted && data.errors?.length) {
        status.textContent = `✗ ${data.errors[0].error}`;
      } else {
        // The open event was probably shifted too, so its form now holds stale
        // times — hand back to the caller, which closes the modal and reloads
        // rather than leaving a Save button that would undo the shift.
        const skipped = data.skipped ? ` (${data.skipped} skipped)` : '';
        onShifted(`${data.shifted}/${data.total} events shifted${skipped}`);
        return;
      }
    } catch (err) {
      status.textContent = '✗ ' + err.message;
    } finally {
      futureBtn.disabled = false;
      allBtn.disabled = false;
    }
  }
  futureBtn.addEventListener('click', () => doShift(true));
  allBtn.addEventListener('click', () => doShift(false));

  const controls = document.createElement('div');
  controls.className = 'batch-shift-controls';
  controls.append(nInput, unitSel, futureBtn, allBtn, status);
  row.append(catLabel, controls);
  return row;
}
