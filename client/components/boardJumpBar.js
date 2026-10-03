// A compact overview for boards that show one column at a time on phones.

/**
 * @param {HTMLElement} board
 * @param {{label: string, count: number, head: HTMLElement}[]} columns
 * @returns {{element: HTMLElement, update: () => void}}
 */
export function buildBoardJumpBar(board, columns) {
  const bar = document.createElement('nav');
  bar.className = 'task-board-jump';
  bar.setAttribute('aria-label', 'Board columns');

  const buttons = [];
  for (const column of columns) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'task-board-jump-button';
    button.setAttribute('aria-label', `Go to ${column.label} column, ${column.count} tasks`);
    const label = document.createElement('span');
    label.textContent = column.label;
    const count = document.createElement('span');
    count.className = 'task-board-jump-count';
    count.textContent = String(column.count);
    button.append(label, count);
    button.addEventListener('click', function jumpToColumn() {
      board.scrollTo({
        left: column.head.offsetLeft - columns[0].head.offsetLeft,
        behavior: 'smooth',
      });
    });
    bar.appendChild(button);
    buttons.push(button);
  }

  let selected = -1;
  function update() {
    if (!columns.length) return;
    const center = board.scrollLeft + board.clientWidth / 2;
    const firstLeft = columns[0].head.offsetLeft;
    let closest = 0;
    let distance = Infinity;
    for (let i = 0; i < columns.length; i += 1) {
      const head = columns[i].head;
      const midpoint = head.offsetLeft - firstLeft + head.offsetWidth / 2;
      const gap = Math.abs(midpoint - center);
      if (gap < distance) {
        closest = i;
        distance = gap;
      }
    }
    if (closest === selected) return;
    selected = closest;
    for (let i = 0; i < buttons.length; i += 1) {
      if (i === closest) buttons[i].setAttribute('aria-current', 'true');
      else buttons[i].removeAttribute('aria-current');
    }
    const button = buttons[closest];
    const left = button.offsetLeft - bar.offsetLeft;
    if (left < bar.scrollLeft || left + button.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollTo({ left: left - (bar.clientWidth - button.offsetWidth) / 2, behavior: 'smooth' });
    }
  }

  return { element: bar, update };
}
