/**
 * `ExtensionPicker` — a controlled multi-select over the extension catalog
 * (`GET /api/extensions`), authoring ONE extension combo (an ordered list of
 * extension names). Built on the DS `Checkbox` so features share one picker
 * instead of re-implementing a checklist (the same reason `SchemaForm`/`ToolPicker`
 * live in the SDK). It is PRESENTATIONAL: the caller fetches `available` and owns
 * the selected `value`; this component fetches nothing.
 *
 * The catalog is GROUPED by `kind`: each kind is a group `Field` named
 * "Kind: <kind>", described "(single-select)" when it is single-select. A kind the catalog serves as not `multiple` is
 * SINGLE-SELECT — checking one of its extensions replaces any other of that kind
 * already in the combo; a `multiple` kind is freely multi-select. Selection order is preserved (the combo is ordered — the
 * stacking order that produces the branch tool name), so a newly-checked extension
 * appends to the end and unchecking removes in place.
 *
 * SAFETY: an extension name AND its kind are server-supplied, so every name/kind
 * renders as TEXT through the DS `Checkbox`/`Field` (React escapes it) — never an
 * HTML sink. Pinned by a test.
 *
 * Geometry and ink come from the design-system layout classes (`tai-stack`,
 * `tai-row`) and `Field`; the component carries no palette of its own.
 */
import type { Extension } from '@tai42/api-client';

import { Checkbox } from './checkbox';
import { groupByKind } from './extension-grouping';
import { Field } from './field';
import { EmptyState } from './primitives';

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

  // An empty catalog renders the shared EmptyState HERE — inside the picker — so
  // every call site inherits it rather than each guarding an empty checklist (a
  // bare div that reads as broken). No provider has published an extension yet.
  if (available.length === 0) {
    return (
      <div data-testid={idPrefix} className="tai-stack">
        <EmptyState title="No extensions are available." />
      </div>
    );
  }

  /**
   * Toggle a single extension. For a kind the catalog serves as not `multiple`,
   * checking one first strips any other selected member of that kind before
   * appending, so the combo carries at most one of it; unchecking just removes it.
   * Order is preserved: a newly-checked name lands at the end.
   */
  const toggle = (extension: Extension, multiple: boolean, checked: boolean): void => {
    if (!checked) {
      onChange(value.filter((name) => name !== extension.name));
      return;
    }
    if (selected.has(extension.name)) return;
    const siblingNames = multiple
      ? undefined
      : new Set(available.filter((e) => e.kind === extension.kind).map((e) => e.name));
    const kept =
      siblingNames === undefined ? [...value] : value.filter((name) => !siblingNames.has(name));
    onChange([...kept, extension.name]);
  };

  return (
    <div data-testid={idPrefix} className="tai-stack">
      {groups.map((group) => (
        <Field
          key={group.kind}
          group
          label={`Kind: ${group.kind}`}
          description={group.multiple ? undefined : '(single-select)'}
        >
          <div className="tai-row">
            {group.members.map((extension) => (
              <Checkbox
                key={extension.name}
                label={extension.name}
                checked={selected.has(extension.name)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  toggle(extension, group.multiple, checked);
                }}
              />
            ))}
          </div>
        </Field>
      ))}
    </div>
  );
}
