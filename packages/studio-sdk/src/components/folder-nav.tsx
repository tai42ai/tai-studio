/**
 * Folder navigation primitives for the tool-organization tree — shared by the tools
 * screen and the flows page so both explore, breadcrumb, and re-file against
 * one identical set of controls.
 *
 * The tree is passed FLAT (a {@link Folder} list keyed by `id`, each naming its
 * `parentId`); these helpers derive the current directory, the breadcrumb path, and
 * the indented picker options from it. Every derivation is cycle-SAFE: a malformed
 * parent chain (a loop, a dangling parent) is bounded by the folder count rather than
 * looping forever — bad data degrades to a truncated path, never a hang.
 *
 * `FolderPicker` carries inline new-folder creation, so a folder can be created from
 * BOTH consuming screens through this one component — never a flows-page-only
 * affordance.
 */
import { useState, type ReactNode } from 'react';

import { ChevronRightIcon, FolderIcon } from './icons';
import { Button } from './primitives';
import { Select } from './select';
import { TextInput } from './inputs';

/** A folder in the tree, in the SDK's camelCase UI shape (`parentId`, `null` = root). */
export interface Folder {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
}

/** The subfolders directly under `parentId` (`null` = the root directory), name-sorted. */
export function childFolders(folders: readonly Folder[], parentId: string | null): Folder[] {
  return folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The ordered ancestor path from the root down to (and including) `folderId`, for a
 * breadcrumb. `null` is the root (an empty path). The walk is bounded by the folder
 * count, so a cyclic or dangling chain truncates instead of looping.
 */
export function folderPathTo(folders: readonly Folder[], folderId: string | null): Folder[] {
  if (folderId === null) return [];
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: Folder[] = [];
  const seen = new Set<string>();
  let current: string | null = folderId;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    const folder = byId.get(current);
    if (folder === undefined) break;
    path.unshift(folder);
    current = folder.parentId;
  }
  return path;
}

export interface FolderBreadcrumbProps {
  readonly folders: readonly Folder[];
  readonly currentFolderId: string | null;
  readonly onNavigate: (folderId: string | null) => void;
  /** The root crumb's label (e.g. "All tools"). */
  readonly rootLabel: string;
}

/** The root → … → current path; each crumb navigates to that level. */
export function FolderBreadcrumb({
  folders,
  currentFolderId,
  onNavigate,
  rootLabel,
}: FolderBreadcrumbProps): ReactNode {
  const path = folderPathTo(folders, currentFolderId);
  return (
    <nav className="tai-row" aria-label="Folder path">
      <Button
        variant="ghost"
        onClick={() => {
          onNavigate(null);
        }}
        aria-current={currentFolderId === null ? 'page' : undefined}
      >
        {rootLabel}
      </Button>
      {path.map((folder) => (
        <span key={folder.id} className="tai-row">
          <ChevronRightIcon />
          <Button
            variant="ghost"
            onClick={() => {
              onNavigate(folder.id);
            }}
            aria-current={folder.id === currentFolderId ? 'page' : undefined}
          >
            {folder.name}
          </Button>
        </span>
      ))}
    </nav>
  );
}

export interface FolderRowProps {
  readonly folder: Folder;
  readonly onOpen: (folderId: string) => void;
}

/** One subfolder in the current-directory explorer; opening it navigates inward. */
export function FolderRow({ folder, onOpen }: FolderRowProps): ReactNode {
  return (
    <Button
      variant="ghost"
      onClick={() => {
        onOpen(folder.id);
      }}
    >
      <FolderIcon />
      <span>{folder.name}</span>
    </Button>
  );
}

/** The sentinel option value for "no folder" — folder ids are UUIDs, so it never collides. */
const UNFILED_VALUE = '__unfiled__';

/** Flatten the tree into indented `Select` options, root first, depth-first. */
function folderOptions(folders: readonly Folder[]): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const folder of childFolders(folders, parentId)) {
      options.push({ value: folder.id, label: `${'  '.repeat(depth)}${folder.name}` });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return options;
}

export interface FolderPickerProps {
  /** The chosen folder id, or `null` for unfiled. */
  readonly value: string | null;
  readonly onChange: (folderId: string | null) => void;
  readonly folders: readonly Folder[];
  /**
   * Create a folder under `parentId` (the current selection) and resolve with its
   * id; the picker selects it. Rejection is the caller's to surface — the picker
   * leaves the draft in place so the operator can retry.
   */
  readonly onCreateFolder: (name: string, parentId: string | null) => Promise<string>;
  readonly disabled?: boolean;
  /** The unfiled option's label (e.g. "No folder"). */
  readonly unfiledLabel: string;
}

/** A folder chooser with inline new-folder creation, for the edit / move dialogs. */
export function FolderPicker({
  value,
  onChange,
  folders,
  onCreateFolder,
  disabled,
  unfiledLabel,
}: FolderPickerProps): ReactNode {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const options = [{ value: UNFILED_VALUE, label: unfiledLabel }, ...folderOptions(folders)];

  const create = async (): Promise<void> => {
    const name = draft.trim();
    if (name === '' || busy) return;
    setBusy(true);
    try {
      const id = await onCreateFolder(name, value);
      onChange(id);
      setDraft('');
      setCreating(false);
    } catch {
      // The caller owns surfacing the failure (its `onCreateFolder` is the loud
      // surface); the picker's part is to keep the draft OPEN with its text so the
      // operator can retry — never to clear it or select nothing.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tai-stack tai-stack-2">
      <Select
        aria-label="Folder"
        options={options}
        value={value ?? UNFILED_VALUE}
        onValueChange={(next) => {
          onChange(next === UNFILED_VALUE ? null : next);
        }}
        disabled={disabled ?? busy}
      />
      {creating ? (
        <div className="tai-row">
          <div style={{ flex: 1 }}>
            <TextInput
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void create();
                }
              }}
              placeholder="New folder name…"
              aria-label="New folder name"
              disabled={busy}
            />
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              void create();
            }}
            disabled={busy || draft.trim() === ''}
          >
            Create
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setCreating(false);
              setDraft('');
            }}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setCreating(true);
          }}
          disabled={disabled}
        >
          <FolderIcon />
          <span>New folder</span>
        </Button>
      )}
    </div>
  );
}
