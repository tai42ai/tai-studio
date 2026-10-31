/**
 * The searchable single-select both `AgentPicker` and `ChannelPicker` render: one list
 * read of names, drawn in its own `Field` with the read's states (pending, error with Retry,
 * loaded and empty) and a stored value the loaded list does not hold flagged with the
 * picker's unlisted label. Each picker hands in its own copy. On a 403 the session may
 * not list the names, and the server checks a named reference on save, so the picker
 * draws a typed entry in place of the select, with the picker's no-list note under it.
 * The host's `error` shows, and the `Field` claims its control id, exactly while a
 * control (the select or the typed entry) renders.
 */
import { type ReactNode, useId } from 'react';

import { errorMessage, isForbiddenError } from '../errors';
import { Badge } from './badge';
import { Field } from './field';
import { ErrorState } from './primitives';
import { SearchableSelect } from './searchable-select';
import type { SelectOption } from './select';
import { TypedNameEntry } from './typed-name-entry';

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
  /** The sentence under the typed entry on a 403: why there is no list, what saving checks. */
  readonly forbiddenNote: string;
  readonly emptyNote: string;
  readonly emptyAction: ReactNode;
  readonly unlistedLabel: string;
  /** Accessible name of the select's search box. */
  readonly searchLabel: string;
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

/** The stored value's own option, flagged, when the loaded list does not hold it. */
function storedOptions(stored: string, unlisted: boolean, unlistedLabel: string): SelectOption[] {
  return unlisted ? [{ value: stored, label: `${stored} (${unlistedLabel})` }] : [];
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
      : [...storedOptions(stored, unlisted, unlistedLabel), ...listedOptions(loaded, names)];
  const selectRenders = pending || (!query.isError && (!empty || unlisted));
  return { refused, failed, pending, unlisted, empty, options, selectRenders };
}

/** The loaded, pending or refused body: the select while one renders, then its notes. */
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
        <SearchableSelect
          options={view.options}
          value={value}
          placeholder={view.pending ? copy.loadingPlaceholder : copy.placeholder}
          disabled={view.pending}
          onValueChange={onValueChange}
          aria-describedby={view.unlisted ? unlistedId : undefined}
          searchLabel={copy.searchLabel}
        />
      ) : null}
      {view.empty ? (
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
  const controlRenders = view.selectRenders || view.refused;
  return (
    <Field
      label={copy.label}
      description={copy.description}
      error={controlRenders ? error : undefined}
      // Only a control claims the field's control id; with nothing to hold no
      // labelable element renders, so `for` would dangle.
      group={!controlRenders}
    >
      {view.failed ? (
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => {
            query.refetch();
          }}
        />
      ) : view.refused ? (
        <TypedNameEntry
          value={value === '' ? null : value}
          onChange={onValueChange}
          disabled={false}
          ariaLabel={undefined}
          note={copy.forbiddenNote}
        />
      ) : (
        <NamedListBody view={view} value={value} onValueChange={onValueChange} copy={copy} />
      )}
    </Field>
  );
}
