/**
 * The single-select both `AgentPicker` and `ChannelPicker` render: one list read of
 * names, drawn in its own `Field` with the read's states (pending, error with Retry,
 * refused on a 403, loaded and empty) and a stored value the loaded list does not
 * hold flagged with the picker's unlisted label. Each picker hands in its own copy.
 * The host's `error` shows, and the `Field` claims its control id, exactly while a
 * `Select` renders.
 */
import { type ReactNode, useId } from 'react';

import { errorMessage, isForbiddenError } from '../errors';
import { Badge } from './badge';
import { Field } from './field';
import { ErrorState } from './primitives';
import { Select, type SelectOption } from './select';

const MUTED_LINE = { margin: 0, color: 'var(--tai-color-text-muted)' } as const;

/** The flags of a list read; `data` is each picker's own. */
export interface ListReadFlags {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isSuccess: boolean;
  readonly error: unknown;
  readonly refetch: () => void;
}

/** The picker's own copy. */
export interface NamedListCopy {
  readonly label: string;
  readonly description?: string | undefined;
  readonly loadingPlaceholder: string;
  readonly placeholder: string;
  readonly forbiddenNote: string;
  readonly emptyNote: string;
  readonly emptyAction: ReactNode;
  readonly unlistedLabel: string;
}

export interface NamedListPickerProps {
  readonly query: ListReadFlags;
  /** The listed names once the read succeeded. */
  readonly names: readonly string[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly error?: string | undefined;
  readonly copy: NamedListCopy;
}

function MutedLine({ text }: { readonly text: string }): ReactNode {
  return (
    <p role="status" style={MUTED_LINE}>
      {text}
    </p>
  );
}

/** What the picker draws, derived from the read, the listed names and the value. */
interface NamedListView {
  readonly refused: boolean;
  readonly failed: boolean;
  readonly pending: boolean;
  readonly unlisted: boolean;
  readonly empty: boolean;
  readonly options: readonly SelectOption[];
  readonly selectRenders: boolean;
}

/** The stored value's own option: flagged when the loaded list does not hold it, and kept
 * unflagged under a 403, where without the list the form claims nothing about it. */
function storedOptions(
  stored: string,
  unlisted: boolean,
  refused: boolean,
  unlistedLabel: string,
): SelectOption[] {
  if (unlisted) return [{ value: stored, label: `${stored} (${unlistedLabel})` }];
  return refused ? [{ value: stored, label: stored }] : [];
}

function listedOptions(loaded: boolean, names: readonly string[]): SelectOption[] {
  return loaded ? names.map((name) => ({ value: name, label: name })) : [];
}

function namedListView(
  query: ListReadFlags,
  names: readonly string[],
  value: string,
  unlistedLabel: string,
): NamedListView {
  const refused = query.isError && isForbiddenError(query.error);
  const failed = query.isError && !refused;
  const loaded = query.isSuccess && !query.isError;
  const pending = !loaded && !query.isError;
  const stored = value !== '' ? value : null;
  const unlisted = loaded && stored !== null && !names.includes(stored);
  const empty = loaded && names.length === 0;

  const options =
    stored === null
      ? listedOptions(loaded, names)
      : [
          ...storedOptions(stored, unlisted, refused, unlistedLabel),
          ...listedOptions(loaded, names),
        ];
  const selectRenders = pending || (refused ? stored !== null : !failed && (!empty || unlisted));
  return { refused, failed, pending, unlisted, empty, options, selectRenders };
}

/** The loaded, pending or refused body: the `Select` while one renders, then its notes. */
function NamedListBody({
  view,
  value,
  onValueChange,
  copy,
}: {
  readonly view: NamedListView;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly copy: NamedListCopy;
}): ReactNode {
  const unlistedId = useId();
  return (
    <>
      {view.selectRenders ? (
        <Select
          options={view.options}
          value={value}
          placeholder={view.pending ? copy.loadingPlaceholder : copy.placeholder}
          disabled={view.pending}
          onValueChange={onValueChange}
          aria-describedby={view.unlisted ? unlistedId : undefined}
        />
      ) : null}
      {view.refused ? <MutedLine text={copy.forbiddenNote} /> : null}
      {view.empty && !view.refused ? (
        <>
          <MutedLine text={copy.emptyNote} />
          {copy.emptyAction}
        </>
      ) : null}
      {view.unlisted ? (
        <p id={unlistedId} className="tai-field-hint" style={{ margin: 0 }}>
          <Badge variant="warning">{copy.unlistedLabel}</Badge>{' '}
          {`${value} is ${copy.unlistedLabel}. Pick another, or saving is refused.`}
        </p>
      ) : null}
    </>
  );
}

export function NamedListPicker({
  query,
  names,
  value,
  onValueChange,
  error,
  copy,
}: NamedListPickerProps): ReactNode {
  const view = namedListView(query, names, value, copy.unlistedLabel);
  return (
    <Field
      label={copy.label}
      description={copy.description}
      error={view.selectRenders ? error : undefined}
      // Only the Select claims the field's control id; with nothing to hold no
      // labelable element renders, so `for` would dangle.
      group={!view.selectRenders}
    >
      {view.failed ? (
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => {
            query.refetch();
          }}
        />
      ) : (
        <NamedListBody view={view} value={value} onValueChange={onValueChange} copy={copy} />
      )}
    </Field>
  );
}
