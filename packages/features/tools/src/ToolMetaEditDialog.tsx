/**
 * The per-tool tool_meta edit dialog for the tools screen: display name, user tags,
 * folder, and a THREE-WAY visibility control (Default / Shown / Hidden). It is the
 * ONLY surface that edits all four overlay fields — the presets screen edits just
 * display name + tags, and hide management is centralized here.
 *
 * The display-name + tags portion is the shared SDK `OverlayDetailsFields`, so those
 * two fields' edit semantics (the pinned blank→null mapping) exist exactly once. The
 * visibility control is a three-value radio group, NOT a checkbox: a two-state box
 * cannot express "defer to the plugin declaration" (`null`), and overlay-`false`
 * unhiding a plugin-hidden tool is ruled behavior. Selecting Default writes `null`
 * WITHOUT deleting the row.
 *
 * Badges follow the tags pattern: the tool's read-only plugin-DECLARED badges render
 * beside an editable overlay-badges input. Badges are INFORMATIONAL — declared labels
 * the server never enforces — which the field copy states outright.
 *
 * On save the dialog sends ONE merge-patch carrying all five fields it owns — this is
 * the surface that owns them, so re-sending them clobbers nothing.
 */
import { useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  FeatureDisabled,
  Field,
  FolderPicker,
  OverlayDetailsFields,
  RadioGroup,
  TagsInput,
  featureDisabledMessage,
  isFeatureDisabled,
  overlayDetailsPatch,
  type Folder,
} from '@tai42/studio-sdk';
import type { ToolMetaPatch } from '@tai42/api-client';

import { BADGES_INFORMATIONAL_NOTE, ToolBadges } from './badges';
import type { ToolView } from './toolView';

/** The three visibility choices, mapping to the overlay's tri-state `hidden`. */
type Visibility = 'default' | 'shown' | 'hidden';

const VISIBILITY_OPTIONS = [
  { value: 'default', label: 'Default (follow the plugin)' },
  { value: 'shown', label: 'Shown' },
  { value: 'hidden', label: 'Hidden' },
] as const;

function visibilityToHidden(visibility: Visibility): boolean | null {
  if (visibility === 'shown') return false;
  if (visibility === 'hidden') return true;
  return null;
}

function hiddenToVisibility(hidden: boolean | null): Visibility {
  if (hidden === true) return 'hidden';
  if (hidden === false) return 'shown';
  return 'default';
}

export interface ToolMetaEditDialogProps {
  readonly tool: ToolView;
  readonly folders: readonly Folder[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreateFolder: (name: string, parentId: string | null) => Promise<string>;
  readonly onSubmit: (patch: ToolMetaPatch) => void;
  readonly saving: boolean;
  /** The overlay write's error; a 501 `tool-meta-not-configured` stands the disabled note. */
  readonly writeError: unknown;
}

/** The dialog shell; the form body is keyed by the tool so it resets per tool. */
export function ToolMetaEditDialog({
  tool,
  folders,
  open,
  onOpenChange,
  onCreateFolder,
  onSubmit,
  saving,
  writeError,
}: ToolMetaEditDialogProps): ReactNode {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${tool.name}`}
      description="Organize this tool: its display name, your tags, its folder, and its visibility."
    >
      {isFeatureDisabled(writeError) ? (
        // The overlay write refused with a 501 `tool-meta-not-configured`: the store
        // is off, so the form cannot save. Show the muted OFF note in place of it.
        <FeatureDisabled feature="Tool metadata" message={featureDisabledMessage(writeError)} />
      ) : (
        <EditForm
          key={tool.name}
          tool={tool}
          folders={folders}
          onCreateFolder={onCreateFolder}
          onSubmit={onSubmit}
          onCancel={() => {
            onOpenChange(false);
          }}
          saving={saving}
        />
      )}
    </Dialog>
  );
}

function EditForm({
  tool,
  folders,
  onCreateFolder,
  onSubmit,
  onCancel,
  saving,
}: {
  readonly tool: ToolView;
  readonly folders: readonly Folder[];
  readonly onCreateFolder: (name: string, parentId: string | null) => Promise<string>;
  readonly onSubmit: (patch: ToolMetaPatch) => void;
  readonly onCancel: () => void;
  readonly saving: boolean;
}): ReactNode {
  const [displayName, setDisplayName] = useState(tool.overlayDisplayName ?? '');
  const [tags, setTags] = useState<readonly string[]>(tool.overlayTags);
  const [badges, setBadges] = useState<readonly string[]>(tool.overlayBadges);
  const [folderId, setFolderId] = useState<string | null>(tool.folderId);
  const [visibility, setVisibility] = useState<Visibility>(hiddenToVisibility(tool.overlayHidden));

  const submit = (): void => {
    onSubmit({
      ...overlayDetailsPatch({ displayName, tags }),
      badges: [...badges],
      folder_id: folderId,
      hidden: visibilityToHidden(visibility),
    });
  };

  return (
    <div className="tai-stack tai-stack-3">
      <OverlayDetailsFields
        value={{ displayName, tags }}
        onChange={(next) => {
          setDisplayName(next.displayName);
          setTags(next.tags);
        }}
        namePlaceholder={tool.name}
        nativeTags={tool.nativeTags}
        disabled={saving}
      />
      <Field label="Badges" description={BADGES_INFORMATIONAL_NOTE} group>
        <div className="tai-stack tai-stack-2">
          {tool.nativeBadges.length > 0 ? (
            <div className="tai-stack tai-stack-2">
              <span className="tai-muted">Declared badges (read-only)</span>
              <ToolBadges badges={tool.nativeBadges} />
            </div>
          ) : null}
          <TagsInput
            value={badges}
            onChange={setBadges}
            disabled={saving}
            aria-label="Badges"
            itemNoun="badge"
          />
        </div>
      </Field>
      <Field label="Folder" description="Where this tool is filed." group>
        <FolderPicker
          value={folderId}
          onChange={setFolderId}
          folders={folders}
          onCreateFolder={onCreateFolder}
          unfiledLabel="No folder"
          disabled={saving}
        />
      </Field>
      <RadioGroup
        label="Visibility"
        options={VISIBILITY_OPTIONS}
        value={visibility}
        onValueChange={(next) => {
          setVisibility(next as Visibility);
        }}
        disabled={saving}
      />
      <div className="tai-row">
        <Button variant="primary" onClick={submit} disabled={saving}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
