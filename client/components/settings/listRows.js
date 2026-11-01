/**
 * Layout pieces shared by the settings list editors (feeds, task sources,
 * boards, integration tokens) and the rows that pair a status with a button.
 */
import { button } from './fields.js';

/** A list editor's row: leading control, stacked fields, remove button. */
export const LIST_ROW_CLASSES = 'mb-sm flex items-center gap-sm';
/** The same row for entries tall enough that centring would float the controls. */
export const LIST_ROW_TOP_CLASSES = 'mb-sm flex items-start gap-sm';
export const LIST_FIELDS_CLASSES = 'flex min-w-0 flex-1 flex-col gap-xs';
/** A status line or input with a compact button trailing it. */
export const STATUS_ROW_CLASSES = 'flex items-center gap-sm';

/** A small button that sits at the end of a status row. */
export function inlineButton(text, variant, onClick) {
  const el = button(text, variant, onClick);
  el.classList.add('shrink-0', 'px-chip-x', 'py-2xs', 'text-sm');
  return el;
}

/** The ghost button that drops an entry from a list editor. */
export function removeButton(text, onClick) {
  const el = button(text, 'ghost', onClick);
  el.classList.add('shrink-0', 'px-sm', 'py-xs', 'text-danger');
  return el;
}
