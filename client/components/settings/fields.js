/**
 * The handful of controls every settings section is built from.
 *
 * Sections write straight into the settings draft instead of leaving values in
 * the DOM for a save handler to scrape back out, so each builder takes an
 * onChange callback and nothing else reads the elements afterwards.
 */

/** Uppercase heading that captions a block of related fields. */
export function groupLabel(text) {
  const el = document.createElement('div');
  el.className = 'modal-section-label';
  el.textContent = text;
  return el;
}

/** Small muted paragraph explaining the field above it. */
export function help(text) {
  const el = document.createElement('div');
  el.className = 'settings-help';
  el.textContent = text;
  return el;
}

/**
 * A labelled block: the label, the control, and an optional hint under it.
 * @param {string} labelText
 * @param {HTMLElement} control
 * @param {string} [hintText]
 */
export function field(labelText, control, hintText) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-field';
  if (labelText) {
    const label = document.createElement('label');
    label.textContent = labelText;
    wrap.appendChild(label);
  }
  wrap.appendChild(control);
  if (hintText) wrap.appendChild(help(hintText));
  return wrap;
}

/** Two fields side by side; they stack on narrow screens via CSS. */
export function row(...fields) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-row';
  for (const f of fields) wrap.appendChild(f);
  return wrap;
}

/** A checkbox with its label, used for every on/off setting. */
export function toggle(labelText, checked, onChange) {
  const label = document.createElement('label');
  label.className = 'settings-toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked, input));
  const span = document.createElement('span');
  span.textContent = labelText;
  label.append(input, span);
  return label;
}

/**
 * A dropdown bound to a fixed option set.
 * @param {*} value - currently selected value
 * @param {Array<{value: string, label: string}>} options
 * @param {function(string): void} onChange
 */
export function select(value, options, onChange) {
  const el = document.createElement('select');
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    option.selected = String(value) === opt.value;
    el.appendChild(option);
  }
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

/**
 * A number input. `onChange` receives the parsed number, clamped to min/max;
 * a blank or unparseable field falls back to `fallback`.
 *
 * Pass `blankValue` when empty is a real answer rather than a slip: the field
 * renders empty whenever the stored value equals it, and an empty field reports
 * it back instead of `fallback`. That keeps a stored sentinel (0 meaning "no
 * limit") out of the user's way while still writing the value the rest of the
 * app expects. Use `placeholder` to say what empty means. Every caller needs
 * one of `fallback` or `blankValue` — they are the two answers to an empty
 * field, and a field with neither has nothing to report.
 *
 * @param {number} value
 * @param {{min?: number, max?: number, step?: number, fallback?: number, blankValue?: number, placeholder?: string}} opts
 * @param {function(number): void} onChange
 */
export function numberInput(value, opts, onChange) {
  const el = document.createElement('input');
  el.type = 'number';
  if (opts.blankValue !== undefined && value === opts.blankValue) {
    el.value = '';
  } else {
    el.value = String(value);
  }
  if (opts.min !== undefined) el.min = String(opts.min);
  if (opts.max !== undefined) el.max = String(opts.max);
  if (opts.step !== undefined) el.step = String(opts.step);
  if (opts.placeholder !== undefined) el.placeholder = opts.placeholder;
  el.addEventListener('change', () => {
    let next = parseInt(el.value, 10);
    if (!Number.isFinite(next)) {
      // An empty field is the answer here, so don't clamp it up to `min`.
      if (opts.blankValue !== undefined) {
        el.value = '';
        onChange(opts.blankValue);
        return;
      }
      next = opts.fallback;
    }
    if (opts.min !== undefined && next < opts.min) next = opts.min;
    if (opts.max !== undefined && next > opts.max) next = opts.max;
    el.value = String(next);
    onChange(next);
  });
  return el;
}

/**
 * A text/url input reporting its trimmed value on every keystroke.
 * @param {string} value
 * @param {{type?: string, placeholder?: string}} opts
 * @param {function(string): void} onChange
 */
export function textInput(value, opts, onChange) {
  const el = document.createElement('input');
  el.type = opts.type || 'text';
  el.value = value || '';
  if (opts.placeholder) el.placeholder = opts.placeholder;
  el.addEventListener('input', () => onChange(el.value.trim()));
  return el;
}

/** A plain button; `variant` picks the shared .btn modifier. */
export function button(text, variant, onClick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `btn btn-${variant}`;
  el.textContent = text;
  el.addEventListener('click', () => onClick(el));
  return el;
}
