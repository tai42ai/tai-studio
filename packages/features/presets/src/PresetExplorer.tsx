/**
 * The active presets as a folder explorer — the shared `ExplorerView` over the ONE
 * tool-organization tree, drawn for this screen's population: a folder shows when
 * its subtree holds a preset or holds no tool at all (`foldersForView`), so folders
 * that hold only other tools stay on the Tools screen. A preset sits in the folder
 * its overlay row files it in (unfiled presets live at the root).
 *
 * Once the overlay is loaded, every folder carries the shared Rename / Move / Delete,
 * each shown only where the caller may make that write, whose Move offers the FULL
 * tree; a preset itself is filed through its edit dialog. The selected preset's
 * entry carries the shared selected look. The current folder is
 * local view state. The tree derivations are memoised on the overlay read and the
 * preset list, so a re-render costs nothing and a change costs one linear pass.
 */
import type { PresetRecord, ToolMetaOverlay } from '@tai42/api-client';
import {
  ExplorerView,
  FolderActionsMenu,
  type FoldersChanged,
  foldersForView,
  toFolders,
  useAppNavigate,
  useToolMetaWriteAccess,
} from '@tai42/studio-sdk';
import { type ReactNode, useMemo, useState } from 'react';

import { type OverlayDetail, PRESET_COLUMNS, PresetCard, PresetCells } from './PresetEntry';

/** The explorer's persisted list/card view key. */
const PRESETS_VIEW_SURFACE = 'presets';

export interface PresetExplorerProps {
  /** The active (non-conflicted) presets — the screen's population. */
  readonly presets: readonly PresetRecord[];
  /** The full overlay read (every folder, every row, hidden ones included);
   *  `undefined` while it loads or after it failed. */
  readonly overlay: ToolMetaOverlay | undefined;
  readonly overlayByTool: ReadonlyMap<string, OverlayDetail>;
  readonly selected: string | undefined;
  /** Re-read the overlay after a folder write. */
  readonly onFoldersChanged: FoldersChanged;
  /** The overlay read succeeded, so the folder actions act on a known tree. */
  readonly overlayLoaded: boolean;
}

export function PresetExplorer({
  presets,
  overlay,
  overlayByTool,
  selected,
  onFoldersChanged,
  overlayLoaded,
}: PresetExplorerProps): ReactNode {
  const navigate = useAppNavigate();
  const { editTool: canFilePresets } = useToolMetaWriteAccess();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const allFolders = useMemo(() => toFolders(overlay?.folders ?? []), [overlay]);
  const folders = useMemo(
    () =>
      foldersForView(
        allFolders,
        overlay?.meta ?? [],
        new Set(presets.map((preset) => preset.name)),
      ),
    [allFolders, overlay, presets],
  );
  const folderIdByTool = useMemo(
    () => new Map((overlay?.meta ?? []).map((row) => [row.tool_name, row.folder_id])),
    [overlay],
  );

  const entryProps = (preset: PresetRecord) => ({
    preset,
    overlay: overlayByTool.get(preset.name),
    selected: preset.name === selected,
  });

  return (
    <ExplorerView<PresetRecord>
      items={presets}
      getItemKey={(preset) => preset.name}
      getFolderId={(preset) => folderIdByTool.get(preset.name) ?? null}
      folders={folders}
      currentFolderId={currentFolderId}
      onNavigate={setCurrentFolderId}
      selectedItemKey={selected}
      rootLabel="All presets"
      viewSurface={PRESETS_VIEW_SURFACE}
      label="Presets"
      columns={PRESET_COLUMNS}
      renderRow={(preset) => <PresetCells {...entryProps(preset)} />}
      renderCard={(preset) => <PresetCard {...entryProps(preset)} />}
      onOpenItem={(preset) => {
        navigate('presets', { preset: preset.name });
      }}
      renderFolderActions={
        overlayLoaded
          ? (folder) => (
              <FolderActionsMenu
                folder={folder}
                folders={allFolders}
                onFoldersChanged={onFoldersChanged}
              />
            )
          : undefined
      }
      emptyStates={{
        empty: {
          title: 'No active presets',
          description: 'Every preset is currently conflicted — resolve them below.',
        },
        emptyFolder: {
          title: 'This folder is empty',
          // The hint names an action only for a caller who has it.
          description: canFilePresets ? 'File a preset here from its Edit dialog.' : undefined,
        },
        noMatch: { title: 'No presets match' },
      }}
    />
  );
}
