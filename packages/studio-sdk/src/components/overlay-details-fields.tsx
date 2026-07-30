/**
 * `OverlayDetailsFields` — the display-name + user-tags editor shared by EVERY
 * tool_meta edit surface (the tools-screen edit dialog, the presets screen, and
 * PLAN_4's flows page). One canonical control means the merge-patch write semantics
 * exist exactly once.
 *
 * Controlled: the caller owns `value` (prefilled from the tool's overlay row) and
 * receives every keystroke through `onChange`. This component edits ONLY the two
 * overlay fields it shows; the write it feeds ({@link overlayDetailsPatch}) sends
 * ONLY `display_name` and `tags`, so the merge-patch API leaves `folder_id`/`hidden`
 * untouched — never re-sent from a baseline.
 *
 * Display-name mapping is PINNED (the API rejects `""` with a 422): a blank or
 * whitespace-only input maps to `display_name: null` (clear the override); trimmed
 * non-empty text is sent as-is. That rule lives in {@link overlayDetailsPatch}, so
 * every consumer clears identically.
 *
 * `nativeTags` (optional) renders the tool's read-only plugin-native tags as
 * visually DISTINCT chips beside the editable input — the one place native and
 * overlay tags are shown apart (every other surface merges them).
 */
import type { ReactNode } from 'react';

import { Field } from './field';
import { TextInput } from './inputs';
import { TagChips, TagsInput } from './tags';

/** The two overlay fields this control edits. */
export interface OverlayDetails {
  /** The raw display-name draft (unblank-normalized only at write time). */
  readonly displayName: string;
  readonly tags: readonly string[];
}

export interface OverlayDetailsFieldsProps {
  readonly value: OverlayDetails;
  readonly onChange: (next: OverlayDetails) => void;
  readonly disabled?: boolean;
  /**
   * The tool's real name, shown as the display-name input's placeholder so an empty
   * override reads as "falls back to <name>".
   */
  readonly namePlaceholder?: string;
  /**
   * Read-only plugin-native tags, rendered as distinct chips. Present only in the
   * edit surfaces that want native and overlay tags shown apart.
   */
  readonly nativeTags?: readonly string[];
}

/** The merge-patch a display-name + tags write sends: ONLY these two fields. */
export function overlayDetailsPatch(value: OverlayDetails): {
  display_name: string | null;
  tags: string[];
} {
  const trimmed = value.displayName.trim();
  return { display_name: trimmed === '' ? null : trimmed, tags: [...value.tags] };
}

export function OverlayDetailsFields({
  value,
  onChange,
  disabled,
  namePlaceholder,
  nativeTags,
}: OverlayDetailsFieldsProps): ReactNode {
  return (
    <div className="tai-stack tai-stack-3">
      <Field
        label="Display name"
        description="Shown instead of the tool's real name. Leave blank to use the real name."
      >
        <TextInput
          value={value.displayName}
          onChange={(event) => {
            onChange({ ...value, displayName: event.target.value });
          }}
          placeholder={namePlaceholder}
          disabled={disabled}
        />
      </Field>
      <Field label="Tags" description="Your own labels for grouping and filtering." group>
        <div className="tai-stack tai-stack-2">
          {nativeTags !== undefined && nativeTags.length > 0 ? (
            <div className="tai-stack tai-stack-2">
              <span className="tai-muted">Native tags (read-only)</span>
              <TagChips tags={nativeTags} />
            </div>
          ) : null}
          <TagsInput
            value={value.tags}
            onChange={(next) => {
              onChange({ ...value, tags: next });
            }}
            disabled={disabled}
            aria-label="Tags"
          />
        </div>
      </Field>
    </div>
  );
}
