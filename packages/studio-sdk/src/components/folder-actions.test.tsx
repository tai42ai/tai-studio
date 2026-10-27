/**
 * The shared folder actions: Rename, Move and Delete write through the folder doors
 * and then refresh the caller's tree; Move never offers the folder's own subtree; a
 * refused write is shown in its dialog. Each action is offered only on its own route,
 * and every action is withdrawn once a write reveals the tool_meta store off.
 */
import type { ApiClient, MeProjection } from '@tai42/api-client';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { projectionReaching, writeSession } from '../hooks/test-write-session';
import { useCapabilities } from '../hooks/useCapabilities';
import { FolderActionsMenu } from './folder-actions';
import type { Folder } from './folder-nav';

const ALPHA: Folder = { id: 'f1', name: 'Alpha', parentId: null };
const BETA: Folder = { id: 'f2', name: 'Beta', parentId: null };
const GAMMA: Folder = { id: 'f3', name: 'Gamma', parentId: 'f1' };
const DELTA: Folder = { id: 'f4', name: 'Delta', parentId: 'f3' };
const FOLDERS: Folder[] = [ALPHA, BETA, GAMMA, DELTA];

const REFUSAL = {
  status: 501,
  code: 'tool-meta-not-configured',
  message: 'Tool metadata needs a tool_meta store.',
};

afterEach(() => {
  globalThis.sessionStorage.clear();
});

/** The projection's status, so a test can assert an absence only once it is ready. */
function ProjectionStatus(): ReactNode {
  const { state } = useCapabilities();
  return state.status === 'ready' ? <span data-testid="projection">ready</span> : null;
}

function renderMenu(client: Partial<ApiClient>, folder: Folder = ALPHA, projection?: MeProjection) {
  const onFoldersChanged = vi.fn(() => Promise.resolve());
  render(
    <>
      <FolderActionsMenu folder={folder} folders={FOLDERS} onFoldersChanged={onFoldersChanged} />
      <ProjectionStatus />
    </>,
    { wrapper: writeSession(client, { projection }) },
  );
  return { onFoldersChanged };
}

describe('FolderActionsMenu', () => {
  it('renames a folder through the folder door and refreshes the tree', async () => {
    const user = userEvent.setup();
    const renameFolder = vi.fn().mockResolvedValue({ id: 'f1', name: 'Renamed', parent_id: null });
    const { onFoldersChanged } = renderMenu({ renameFolder });

    await user.click(await screen.findByRole('button', { name: 'Rename folder Alpha' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Folder name');
    await user.clear(input);
    await user.type(input, 'Renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(renameFolder).toHaveBeenCalledWith('f1', 'Renamed');
    expect(onFoldersChanged).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves a folder to a newly created destination through the folder door', async () => {
    const user = userEvent.setup();
    const moveFolder = vi.fn().mockResolvedValue({ id: 'f1', name: 'Alpha', parent_id: 'f-new' });
    const createFolder = vi.fn().mockResolvedValue({ id: 'f-new', name: 'Dest', parent_id: null });
    const { onFoldersChanged } = renderMenu({ moveFolder, createFolder });

    await user.click(await screen.findByRole('button', { name: 'Move folder Alpha' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: /New folder/ }));
    await user.type(within(dialog).getByLabelText('New folder name'), 'Dest');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(createFolder).toHaveBeenCalledWith('Dest', null);
    expect(onFoldersChanged).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect(moveFolder).toHaveBeenCalledWith('f1', 'f-new');
    expect(onFoldersChanged).toHaveBeenCalledTimes(2);
  });

  it('offers every folder outside the moved folder subtree as a destination', async () => {
    const user = userEvent.setup();
    renderMenu({});

    await user.click(await screen.findByRole('button', { name: 'Move folder Alpha' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox'));
    const options = (await screen.findAllByRole('option')).map((option) =>
      option.textContent.trim(),
    );
    expect(options).toEqual(['Root (no folder)', 'Beta']);
  });

  it('shows a move refusal in the dialog and keeps it open', async () => {
    const user = userEvent.setup();
    const moveFolder = vi.fn().mockRejectedValue(new Error('Folder not found'));
    const { onFoldersChanged } = renderMenu({ moveFolder }, GAMMA);

    await user.click(await screen.findByRole('button', { name: 'Move folder Gamma' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Root (no folder)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Folder not found');
    expect(onFoldersChanged).not.toHaveBeenCalled();
  });

  it('deletes a folder after confirmation and refreshes the tree', async () => {
    const user = userEvent.setup();
    const deleteFolder = vi.fn().mockResolvedValue({ folder_id: 'f2', deleted: true });
    const { onFoldersChanged } = renderMenu({ deleteFolder }, BETA);

    await user.click(await screen.findByRole('button', { name: 'Delete folder Beta' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Only an empty folder can be deleted');
    await user.click(within(dialog).getByRole('button', { name: 'Delete folder' }));

    expect(deleteFolder).toHaveBeenCalledWith('f2');
    expect(onFoldersChanged).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the server refusal to delete a folder that is not empty', async () => {
    const user = userEvent.setup();
    const deleteFolder = vi.fn().mockRejectedValue(new Error('Folder is not empty'));
    const { onFoldersChanged } = renderMenu({ deleteFolder });

    await user.click(await screen.findByRole('button', { name: 'Delete folder Alpha' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete folder' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Folder is not empty');
    expect(onFoldersChanged).not.toHaveBeenCalled();
  });

  it('offers each action only where the caller reaches its own route', async () => {
    renderMenu(
      {},
      ALPHA,
      projectionReaching({ method: 'POST', path: '/api/tool-meta/folders/{folder_id}/rename' }),
    );
    expect(await screen.findByRole('button', { name: 'Rename folder Alpha' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move folder Alpha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete folder Alpha' })).not.toBeInTheDocument();
  });

  it('offers no folder action to a caller who reaches only the tool edit route', async () => {
    renderMenu(
      {},
      ALPHA,
      projectionReaching({ method: 'PATCH', path: '/api/tool-meta/tools/{tool_name}' }),
    );
    // Absence is asserted only once the projection is ready.
    expect(await screen.findByTestId('projection')).toHaveTextContent('ready');
    expect(screen.queryByRole('button', { name: /folder Alpha/ })).not.toBeInTheDocument();
  });

  it('shows a not-configured refusal as the off note and then withdraws every action', async () => {
    const user = userEvent.setup();
    const renameFolder = vi.fn().mockRejectedValue(REFUSAL);
    renderMenu({ renameFolder });

    await user.click(await screen.findByRole('button', { name: 'Rename folder Alpha' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Folder name'), ' 2');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(await within(dialog).findByTestId('feature-disabled')).toHaveTextContent(
      REFUSAL.message,
    );
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: /folder Alpha/ })).not.toBeInTheDocument();
  });
});
