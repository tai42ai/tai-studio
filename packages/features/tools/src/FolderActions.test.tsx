/**
 * Tests for the tools folder actions: Rename writes the new name through the folder
 * door; Move writes the chosen parent; and the move target set excludes the folder
 * itself and its descendants (a folder can never become its own ancestor).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Folder } from '@tai42/studio-sdk';

import { renderWithProviders } from './test-utils';
import { FolderActionsMenu, subtreeIds } from './FolderActions';

const ALPHA: Folder = { id: 'f1', name: 'Alpha', parentId: null };
const BETA: Folder = { id: 'f2', name: 'Beta', parentId: null };
const GAMMA: Folder = { id: 'f3', name: 'Gamma', parentId: 'f1' };
const DELTA: Folder = { id: 'f4', name: 'Delta', parentId: 'f3' };
const FOLDERS: Folder[] = [ALPHA, BETA, GAMMA, DELTA];

describe('subtreeIds', () => {
  it('collects the folder plus every descendant, however deep', () => {
    const ids = subtreeIds(ALPHA, FOLDERS);
    // f1 and its whole subtree (f3 → f4); the sibling f2 stays a legal target.
    expect([...ids].sort()).toEqual(['f1', 'f3', 'f4']);
    expect(ids.has('f2')).toBe(false);
  });

  it('is just the folder itself for a leaf', () => {
    const ids = subtreeIds(DELTA, FOLDERS);
    expect([...ids]).toEqual(['f4']);
  });
});

describe('FolderActionsMenu', () => {
  it('renames a folder through the folder door', async () => {
    const user = userEvent.setup();
    const renameFolder = vi.fn().mockResolvedValue({ id: 'f1', name: 'Renamed', parent_id: null });
    renderWithProviders(<FolderActionsMenu folder={ALPHA} folders={FOLDERS} />, {
      client: { renameFolder },
    });

    await user.click(screen.getByRole('button', { name: 'Rename folder Alpha' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Folder name');
    await user.clear(input);
    await user.type(input, 'Renamed');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(renameFolder).toHaveBeenCalledWith('f1', 'Renamed');
  });

  it('moves a folder to a newly created destination through the folder door', async () => {
    const user = userEvent.setup();
    const moveFolder = vi.fn().mockResolvedValue({ id: 'f1', name: 'Alpha', parent_id: 'f-new' });
    const createFolder = vi.fn().mockResolvedValue({ id: 'f-new', name: 'Dest', parent_id: null });
    renderWithProviders(<FolderActionsMenu folder={ALPHA} folders={FOLDERS} />, {
      client: { moveFolder, createFolder },
    });

    await user.click(screen.getByRole('button', { name: 'Move folder Alpha' }));
    const dialog = await screen.findByRole('dialog');
    // Move is disabled until the destination differs from the current parent.
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled();

    // Create a fresh destination folder inline; the picker selects it.
    await user.click(within(dialog).getByRole('button', { name: /New folder/ }));
    await user.type(within(dialog).getByLabelText('New folder name'), 'Dest');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(createFolder).toHaveBeenCalledWith('Dest', null);

    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect(moveFolder).toHaveBeenCalledWith('f1', 'f-new');
  });
});
