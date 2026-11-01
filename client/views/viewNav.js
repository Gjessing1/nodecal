// The prev / title / Today / next bar at the top of the month, week and day
// views. Each view wires its own navigation; this only builds the pieces so the
// three bars stay identical.

/** Applied to the title span; a view that opens a picker on tap adds a cursor. */
export const NAV_TITLE_CLASSES = 'flex-1 text-center text-md font-semibold';

export function createNavBar() {
  const nav = document.createElement('div');
  nav.className =
    'sticky top-0 z-10 flex items-center gap-sm border-b border-border bg-bg px-md py-sm';
  return nav;
}

/** @param {string} glyph */
export function createNavArrow(glyph) {
  const btn = document.createElement('button');
  btn.className = 'rounded-sm px-sm py-xs text-xl leading-none text-accent';
  btn.textContent = glyph;
  return btn;
}

/** @param {boolean} hidden - true when the view already shows today */
export function createTodayButton(hidden) {
  const btn = document.createElement('button');
  btn.className = 'rounded-sm border border-accent px-sm py-xs text-sm text-accent';
  btn.textContent = 'Today';
  btn.hidden = hidden;
  return btn;
}
