/**
 * Filing one tool: the dialog writes only `folder_id` through the overlay door,
 * refreshes the caller's tree, and shows a refused write in place — a not-configured
 * refusal as the off note, reported so every screen withdraws its overlay writes.
 */
import type { ApiClient } from '@tai42/api-client';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { writeSession } from '../hooks/test-write-session';
import { useFeatureOff } from '../hooks/useSystemKinds';
import { MoveToFolderDialog } from './folder-filing';
import type { Folder } from './folder-nav';

const FOLDERS: Folder[] = [
  { id: 'f1', name: 'Alpha', parentId: null },
  { id: 'f2', name: 'Nested', parentId: 'f1' },
];

afterEach(() => {
  globalThis.sessionStorage.clear();
});

/** Whether the tool_meta store reads off app-wide. */
function StoreOff(): ReactNode {
  return useFeatureOff('tool_meta') ? <span data-testid="store-off" /> : null;
}

function renderDialog(client: Partial<ApiClient>, currentFolderId: string | null = null) {
  const onFoldersChanged = vi.fn(() => Promise.resolve());
  const onClose = vi.fn();
  render(
    <>
      <MoveToFolderDialog
        toolName="echo_agent"
        label="echo-agent"
        currentFolderId={currentFolderId}
        folders={FOLDERS}
        onFoldersChanged={onFoldersChanged}
        onClose={onClose}
      />
      <StoreOff />
    </>,
    { wrapper: writeSession(client) },
  );
  return { onFoldersChanged, onClose };
}

describe('MoveToFolderDialog', () => {
  it('files the tool into the chosen folder with a folder-only merge-patch', async () => {
    const user = userEvent.setup();
    const upsertToolMeta = vi.fn().mockResolvedValue({});
    const { onFoldersChanged, onClose } = renderDialog({ upsertToolMeta });

    const dialog = screen.getByRole('dialog', { name: 'Move echo-agent to a folder' });
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled();
    await user.click(within(dialog).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Nested' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    expect(upsertToolMeta).toHaveBeenCalledWith('echo_agent', { folder_id: 'f2' });
    expect(onFoldersChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('unfiles the tool when no folder is chosen', async () => {
    const user = userEvent.setup();
    const upsertToolMeta = vi.fn().mockResolvedValue({});
    renderDialog({ upsertToolMeta }, 'f1');

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'No folder' }));
    await user.click(screen.getByRole('button', { name: 'Move' }));

    expect(upsertToolMeta).toHaveBeenCalledWith('echo_agent', { folder_id: null });
  });

  it('shows a refused write and stays open', async () => {
    const user = userEvent.setup();
    const upsertToolMeta = vi.fn().mockRejectedValue(new Error('Folder not found'));
    const { onFoldersChanged, onClose } = renderDialog({ upsertToolMeta });

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Move' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Folder not found');
    expect(onFoldersChanged).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a not-configured refusal as the off note and reports the store off', async () => {
    const user = userEvent.setup();
    const upsertToolMeta = vi.fn().mockRejectedValue({
      status: 501,
      code: 'tool-meta-not-configured',
      message: 'Tool metadata needs a tool_meta store.',
    });
    renderDialog({ upsertToolMeta });

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Move' }));

    expect(await screen.findByTestId('feature-disabled')).toHaveTextContent(
      'Tool metadata needs a tool_meta store.',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('store-off')).toBeInTheDocument();
  });
});
