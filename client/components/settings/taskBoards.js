import { BOARD_FIELDS } from '../../app/boardBuckets.js';
import { boardsFromConfig } from '../../app/boardModel.js';
import { button, field, help, row, select, textInput } from './fields.js';

/**
 * Editor for `draft.taskBoards` — the kanban boards the Tasks view offers in
 * its layout menu. Each board picks a field for its columns and, optionally, a
 * second field that splits every column into swim lanes.
 * @param {HTMLElement} host - container owned by this editor; re-rendered in place
 * @param {Record<string, any>} draft
 */
export function renderTaskBoards(host, draft) {
  // Nothing saved yet means the built-in boards are in use; seed the draft with
  // them so they show up here and can be renamed or changed like any other.
  if (!Array.isArray(draft.taskBoards) || !draft.taskBoards.length) {
    draft.taskBoards = structuredClone(boardsFromConfig(draft));
  }
  const boards = draft.taskBoards;

  host.innerHTML = '';
  host.appendChild(
    help(
      'Boards appear in the Tasks view’s layout menu as “Kanban: name”. Columns split tasks across; lanes split each column into rows.',
    ),
  );

  for (let idx = 0; idx < boards.length; idx++) {
    host.appendChild(buildBoardRow(host, draft, idx));
  }

  host.appendChild(
    button('+ Add board', 'ghost', () => {
      boards.push({
        id: newBoardId(boards),
        name: 'New board',
        columns: 'status',
        lanes: 'priority',
      });
      renderTaskBoards(host, draft);
    }),
  );
}

/**
 * @param {HTMLElement} host
 * @param {Record<string, any>} draft
 * @param {number} idx
 */
function buildBoardRow(host, draft, idx) {
  const board = draft.taskBoards[idx];

  const name = textInput(board.name, { placeholder: 'Board name' }, (value) => {
    board.name = value;
  });

  const columns = select(board.columns, BOARD_FIELDS, (value) => {
    board.columns = value;
    // Lanes by the column field would put every task on the diagonal.
    if (board.lanes === value) board.lanes = '';
    renderTaskBoards(host, draft);
  });

  const laneOptions = [{ value: '', label: 'No lanes' }];
  for (const option of BOARD_FIELDS) {
    if (option.value !== board.columns) laneOptions.push(option);
  }
  const lanes = select(board.lanes || '', laneOptions, (value) => {
    board.lanes = value;
  });

  const fields = document.createElement('div');
  fields.className = 'settings-list-fields';
  fields.append(name, row(field('Columns', columns), field('Lanes', lanes)));

  const line = document.createElement('div');
  line.className = 'settings-list-row settings-list-row-top';
  line.appendChild(fields);

  // The Tasks view always needs a board to offer, so the last one stays.
  if (draft.taskBoards.length > 1) {
    const remove = button('×', 'ghost', () => {
      draft.taskBoards.splice(idx, 1);
      renderTaskBoards(host, draft);
    });
    remove.classList.add('settings-remove-btn');
    remove.setAttribute('aria-label', `Remove board ${board.name}`);
    line.appendChild(remove);
  }
  return line;
}

/**
 * @param {Array<{id: string}>} boards
 * @returns {string}
 */
function newBoardId(boards) {
  const taken = new Set();
  for (const board of boards) taken.add(board.id);
  let id = `board-${Date.now().toString(36)}`;
  let suffix = 1;
  while (taken.has(id)) {
    id = `board-${Date.now().toString(36)}-${suffix}`;
    suffix++;
  }
  return id;
}
