import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  FolderBreadcrumb,
  FolderPicker,
  FolderRow,
  childFolders,
  folderPathTo,
  type Folder,
} from '../index';

const FOLDERS: Folder[] = [
  { id: 'w', name: 'Weather', parentId: null },
  { id: 'eu', name: 'Europe', parentId: 'w' },
  { id: 'us', name: 'Americas', parentId: 'w' },
  { id: 'misc', name: 'Misc', parentId: null },
];

describe('childFolders', () => {
  it('returns the direct children of a parent, name-sorted', () => {
    expect(childFolders(FOLDERS, 'w').map((f) => f.name)).toEqual(['Americas', 'Europe']);
  });

  it('returns the root folders for a null parent', () => {
    expect(childFolders(FOLDERS, null).map((f) => f.name)).toEqual(['Misc', 'Weather']);
  });
});

describe('folderPathTo', () => {
  it('is empty at the root', () => {
    expect(folderPathTo(FOLDERS, null)).toEqual([]);
  });

  it('walks root → … → current in order', () => {
    expect(folderPathTo(FOLDERS, 'eu').map((f) => f.name)).toEqual(['Weather', 'Europe']);
  });

  it('truncates a cyclic chain instead of looping forever', () => {
    const cyclic: Folder[] = [
      { id: 'a', name: 'A', parentId: 'b' },
      { id: 'b', name: 'B', parentId: 'a' },
    ];
    // Bounded by the seen-set: it stops rather than hanging, returning the reachable run.
    const path = folderPathTo(cyclic, 'a');
    expect(path.length).toBeLessThanOrEqual(2);
  });

  it('stops at a dangling parent reference', () => {
    const dangling: Folder[] = [{ id: 'x', name: 'X', parentId: 'ghost' }];
    expect(folderPathTo(dangling, 'x').map((f) => f.name)).toEqual(['X']);
  });
});

describe('FolderBreadcrumb', () => {
  it('renders the root crumb plus the path, marking the current level', () => {
    render(
      <FolderBreadcrumb
        folders={FOLDERS}
        currentFolderId="eu"
        onNavigate={() => undefined}
        rootLabel="All tools"
      />,
    );
    expect(screen.getByRole('button', { name: 'All tools' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Europe' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates to the root when the root crumb is clicked', async () => {
    const onNavigate = vi.fn();
    render(
      <FolderBreadcrumb
        folders={FOLDERS}
        currentFolderId="eu"
        onNavigate={onNavigate}
        rootLabel="All tools"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'All tools' }));
    expect(onNavigate).toHaveBeenCalledWith(null);
  });

  it('navigates to an ancestor crumb', async () => {
    const onNavigate = vi.fn();
    render(
      <FolderBreadcrumb
        folders={FOLDERS}
        currentFolderId="eu"
        onNavigate={onNavigate}
        rootLabel="All tools"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Weather' }));
    expect(onNavigate).toHaveBeenCalledWith('w');
  });
});

describe('FolderRow', () => {
  it('opens the folder it represents', async () => {
    const onOpen = vi.fn();
    const europe: Folder = { id: 'eu', name: 'Europe', parentId: 'w' };
    render(<FolderRow folder={europe} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Europe' }));
    expect(onOpen).toHaveBeenCalledWith('eu');
  });
});

describe('FolderPicker', () => {
  it('selects a folder through the listbox', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FolderPicker
        value={null}
        onChange={onChange}
        folders={FOLDERS}
        onCreateFolder={() => Promise.resolve('new')}
        unfiledLabel="No folder"
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Europe' }));
    expect(onChange).toHaveBeenCalledWith('eu');
  });

  it('maps the unfiled option back to null', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FolderPicker
        value="eu"
        onChange={onChange}
        folders={FOLDERS}
        onCreateFolder={() => Promise.resolve('new')}
        unfiledLabel="No folder"
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'No folder' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('creates a folder inline under the current selection and selects it', async () => {
    const onChange = vi.fn();
    const onCreateFolder = vi.fn(() => Promise.resolve('created-id'));
    render(
      <FolderPicker
        value="w"
        onChange={onChange}
        folders={FOLDERS}
        onCreateFolder={onCreateFolder}
        unfiledLabel="No folder"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }));
    await userEvent.type(screen.getByLabelText('New folder name'), 'Nordics');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    // The new folder's parent is the current selection.
    expect(onCreateFolder).toHaveBeenCalledWith('Nordics', 'w');
    expect(onChange).toHaveBeenCalledWith('created-id');
    // The draft input closes on success.
    expect(screen.queryByLabelText('New folder name')).not.toBeInTheDocument();
  });

  it('cancels inline creation without calling the creator', async () => {
    const onCreateFolder = vi.fn(() => Promise.resolve('x'));
    render(
      <FolderPicker
        value={null}
        onChange={() => undefined}
        folders={FOLDERS}
        onCreateFolder={onCreateFolder}
        unfiledLabel="No folder"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }));
    await userEvent.type(screen.getByLabelText('New folder name'), 'Scratch');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCreateFolder).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('New folder name')).not.toBeInTheDocument();
  });

  it('keeps the draft in place when creation rejects, for a retry', async () => {
    const onCreateFolder = vi
      .fn<(name: string, parentId: string | null) => Promise<string>>()
      .mockRejectedValueOnce(new Error('conflict'))
      .mockResolvedValueOnce('ok-id');
    const onChange = vi.fn();
    render(
      <FolderPicker
        value={null}
        onChange={onChange}
        folders={FOLDERS}
        onCreateFolder={onCreateFolder}
        unfiledLabel="No folder"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }));
    const input = screen.getByLabelText('New folder name');
    await userEvent.type(input, 'Nordics');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    // Rejection leaves the draft open with its text so the operator can retry.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('New folder name')).toHaveValue('Nordics');
    // The retry succeeds via Enter.
    await userEvent.type(input, '{Enter}');
    expect(onChange).toHaveBeenCalledWith('ok-id');
  });
});
