/**
 * `ExtensionPicker` — a controlled multi-select over the extension catalog
 * (`GET /api/extensions`), authoring ONE extension combo (an ordered list of
 * extension names). Built on the DS `Checkbox` so features share one picker
 * instead of re-implementing a checklist (the same reason `SchemaForm`/`ToolPicker`
 * live in the SDK). It is PRESENTATIONAL: the caller fetches `available` and owns
 * the selected `value`; this component fetches nothing.
 *
 * The catalog is GROUPED by `kind`. The `backend` kind is the single NON-STACKABLE
 * one (`multiple=False`), so it is SINGLE-SELECT — checking a backend
 * extension replaces any other backend already in the combo; every other kind is
 * freely multi-select. Selection order is preserved (the combo is ordered — the
 * stacking order that produces the branch tool name), so a newly-checked extension
 * appends to the end and unchecking removes in place.
 *
 * SAFETY: an extension name AND its kind are server-supplied, so every name/kind
 * renders as TEXT through the DS `Checkbox`/`Badge` (React escapes it) — never an
 * HTML sink. Pinned by a test.
 *
 * Geometry and ink come from the design-system layout classes (`tai-stack`,
 * `tai-row`, `tai-label`); the component carries no palette of its own.
 */
import type { Extension } from '@tai42/api-client';

import { Badge } from './badge';
import { Checkbox } from './checkbox';
import { groupByKind, kindVariant } from './extension-grouping';

export interface ExtensionPickerProps {
  /** The extension catalog (`GET /api/extensions`) the checklist is drawn from. */
  readonly available: readonly Extension[];
  /** The currently-selected extension names, in combo (stacking) order. */
  readonly value: readonly string[];
  /** Fired with the next ordered selection whenever a box toggles. */
  readonly onChange: (names: string[]) => void;
  readonly disabled?: boolean;
  readonly idPrefix?: string;
}

export function ExtensionPicker({
  available,
  value,
  onChange,
  disabled,
  idPrefix = 'extension-picker',
}: ExtensionPickerProps) {
  const groups = groupByKind(available);
  const selected = new Set(value);

  /**
   * Toggle a single extension. For a NON-STACKABLE kind (`backend`), checking one
   * first strips any other selected member of that kind before appending, so the
   * combo carries at most one backend; unchecking just removes it. Order is
   * preserved: a newly-checked name lands at the end.
   */
  const toggle = (extension: Extension, nonStackable: boolean, checked: boolean): void => {
    if (!checked) {
      onChange(value.filter((name) => name !== extension.name));
      return;
    }
    if (selected.has(extension.name)) return;
    const siblingNames = nonStackable
      ? new Set(available.filter((e) => e.kind === extension.kind).map((e) => e.name))
      : undefined;
    const kept =
      siblingNames === undefined ? [...value] : value.filter((name) => !siblingNames.has(name));
    onChange([...kept, extension.name]);
  };

  return (
    <div data-testid={idPrefix} className="tai-stack">
      {groups.map((group) => (
        <div key={group.kind} className="tai-stack tai-stack-2">
          {/* The kind heading is a layout row, not prose: its badge names the kind and
              the single-select qualifier rides beside it in the shared label style. */}
          <div className="tai-row">
            <Badge variant={kindVariant(group.kind)}>{group.kind}</Badge>
            {group.nonStackable ? <span className="tai-label">(single-select)</span> : null}
          </div>
          <div className="tai-row">
            {group.members.map((extension) => (
              <Checkbox
                key={extension.name}
                label={extension.name}
                checked={selected.has(extension.name)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  toggle(extension, group.nonStackable, checked);
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
