/**
 * Picks the api key a stored record (a route, a hook, a trigger link, a schedule)
 * RUNS AS. Presentational and prop-driven — the host feature owns the api-key list
 * query and hands it in, so this component (and the SDK) stay free of a
 * data-fetching library, exactly as {@link ToolPicker} does.
 *
 * The `binding` decides what renders: nothing with access control off, a pending
 * control while the session's projection loads, and otherwise the key list plus the
 * session's own identity when it is an api key the list does not hold. A stored key
 * the loaded list does not hold is flagged with what the server will make of it,
 * compared with the session's identity. The server decides authorization; the host
 * form renders its refusal verbatim elsewhere.
 */
import type { TokensPayload } from '@tai42/api-client';
import { type ReactNode, useId } from 'react';

import { errorMessage, isForbiddenError } from '../errors';
import type { ExecutionKeyBinding, OwnIdentity } from '../hooks/useCapabilities';
import { Badge } from './badge';
import { Field } from './field';
import { ErrorState } from './primitives';
import { Select, type SelectOption } from './select';

/**
 * The subset of the api-key list query this picker reads. A caller's TanStack
 * `UseQueryResult<TokensPayload>` satisfies it structurally, so the SDK names no
 * query library.
 */
export interface ExecutionKeyQuery {
  readonly data: TokensPayload | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isSuccess: boolean;
  readonly error: unknown;
  readonly refetch: () => void;
}

/** Resolved, and holding no key at all. */
export function isExecutionKeyListEmpty(query: ExecutionKeyQuery): boolean {
  return query.isSuccess && (query.data?.length ?? 0) === 0;
}

/** The mint's stable fingerprint (never key material), nested under `policy_data`. */
function keyFingerprint(key: TokensPayload[number]): string | undefined {
  const data = key.policy_data;
  if (typeof data !== 'object' || data === null) return undefined;
  const value = data.key_fingerprint;
  return typeof value === 'string' ? value : undefined;
}

/** A key's label: its id, plus whichever of description / fingerprint it has. */
function keyLabel(key: TokensPayload[number]): string {
  const suffix = [key.description, keyFingerprint(key)]
    .filter((part) => part !== undefined && part !== '')
    .join(' · ');
  return suffix === '' ? key.user_id : `${key.user_id} — ${suffix}`;
}

/** One option per `user_id` (what a binding names), first occurrence wins. */
function pickableKeys(keys: TokensPayload): TokensPayload {
  const seen = new Set<string>();
  return keys.filter((key) => {
    if (seen.has(key.user_id)) return false;
    seen.add(key.user_id);
    return true;
  });
}

/**
 * Whether the form has a key to send: always with access control off, never while the
 * projection is pending, and otherwise once the list read has answered (loaded, or
 * refused with a 403) and the picker holds a value, lists a key, or offers a key
 * session's own identity. Under a checked binding the picker renders its `Select`
 * exactly while the list read is pending or this holds.
 */
export function canHoldExecutionKey(
  query: ExecutionKeyQuery,
  binding: ExecutionKeyBinding,
  value: string,
): boolean {
  if (binding.mode === 'unchecked') return true;
  if (binding.mode === 'pending') return false;
  return (
    (query.isSuccess || isForbiddenError(query.error)) &&
    (value !== '' ||
      (query.isSuccess && !isExecutionKeyListEmpty(query)) ||
      binding.own.kind === 'key')
  );
}

/** The unlisted line's sentence for a stored key the key list does not hold. */
function unlistedKeyHint(value: string, own: OwnIdentity): string {
  if (own.admin) {
    return `${value} is not a listed key. As an admin you may bind another identity; the server checks it on save.`;
  }
  if (own.kind === 'account') {
    return `${value} is not a listed key. The server accepts only an api key you own; any other value is refused on save.`;
  }
  return `${value} is not a listed key. The server accepts an unlisted key only when it is your own identity; any other value is refused on save.`;
}

/** The second line: what the comparison of the value with the session's identity shows, or undefined when it shows
 * nothing to say (a key session's own identity). */
function unlistedKeyNote(
  value: string,
  own: OwnIdentity,
): { readonly badge: string; readonly text: string } | undefined {
  if (value === own.userId) {
    return own.kind === 'account'
      ? {
          badge: 'not an api key',
          text: `${value} is this session's account, not an api key, so the server will refuse it on save.`,
        }
      : undefined;
  }
  return {
    badge: 'not your identity',
    text: own.admin
      ? `${value} is not this session's identity (${own.userId}).`
      : `${value} is not this session's identity (${own.userId}), so the server will refuse it on save.`,
  };
}

const DEFAULT_DESCRIPTION =
  "The api key this fire runs AS. Every tool call it makes is authorized against that key's live grants — prefer a least-privilege service key over a human's broad one.";
const FORBIDDEN_NOTE =
  'This session cannot list api keys. Picking one needs read access to GET /api/auth/tokens-payload; ask an administrator to grant it.';
const KEY_EMPTY_NOTE =
  'No api keys of yours are listed. Mint one on the settings API-keys tab to run as a narrower key.';
const ACCOUNT_EMPTY_NOTE =
  'No api keys of yours are listed. You are signed in as an account, not an api key, so your own identity cannot be picked here. Mint a key on the settings API-keys tab first.';
const MUTED_LINE = { margin: 0, color: 'var(--tai-color-text-muted)' } as const;

function MutedLine({ text }: { readonly text: string }): ReactNode {
  return (
    <p role="status" style={MUTED_LINE}>
      {text}
    </p>
  );
}

export interface ExecutionKeyPickerProps {
  /** The api-key list read the host feature owns and hands in. */
  readonly query: ExecutionKeyQuery;
  /** How the host form binds its key (`useExecutionKeyBinding()`). */
  readonly binding: ExecutionKeyBinding;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** The host form's required-field error, shown under the control while a `Select` renders. */
  readonly error?: string | undefined;
  /** The field's description; the default speaks of a fire. */
  readonly description?: string;
}

/** What the checked picker draws, derived from the list read, the value and the session's identity. */
interface CheckedView {
  readonly options: readonly SelectOption[];
  /** A `Select` renders (a pending list, or something to hold). */
  readonly selectRenders: boolean;
  /** The muted note beside or in place of the `Select`. */
  readonly note: string | undefined;
  /** The stored value no listed option carries, once the list loaded. */
  readonly unlisted: boolean;
  /** The session's own identity is offered as an option. */
  readonly ownOffered: boolean;
}

/** The view while the binding is pending: a disabled `Select` and nothing else. */
const PENDING_VIEW: CheckedView = {
  options: [],
  selectRenders: true,
  note: undefined,
  unlisted: false,
  ownOffered: false,
};

/** The `Select`'s options: the stored value no listed option carries (flagged once the list
 * loaded), the session's own identity when offered, then the listed keys. */
function checkedOptions(
  stored: string | null,
  unlisted: boolean,
  forbidden: boolean,
  ownOffered: string | null,
  listed: readonly TokensPayload[number][],
): SelectOption[] {
  const options: SelectOption[] = [];
  if (stored !== null && (unlisted || forbidden)) {
    options.push({ value: stored, label: unlisted ? `${stored} (not a listed key)` : stored });
  }
  if (ownOffered !== null) {
    options.push({ value: ownOffered, label: `${ownOffered} — this session's identity` });
  }
  for (const key of listed) options.push({ value: key.user_id, label: keyLabel(key) });
  return options;
}

/** The muted note: the refused read's, or the empty list's for the session's kind. */
function checkedNote(query: ExecutionKeyQuery, own: OwnIdentity): string | undefined {
  if (isForbiddenError(query.error)) return FORBIDDEN_NOTE;
  if (!isExecutionKeyListEmpty(query)) return undefined;
  return own.kind === 'key' ? KEY_EMPTY_NOTE : ACCOUNT_EMPTY_NOTE;
}

function checkedView(query: ExecutionKeyQuery, own: OwnIdentity, value: string): CheckedView {
  const forbidden = isForbiddenError(query.error);
  const listed = query.isSuccess ? pickableKeys(query.data ?? []) : [];
  const answered = query.isSuccess || forbidden;
  const ownOffered =
    own.kind === 'key' && answered && !listed.some((key) => key.user_id === own.userId);
  const stored = value !== '' && !(ownOffered && value === own.userId) ? value : null;
  const unlisted =
    query.isSuccess && stored !== null && !listed.some((key) => key.user_id === stored);
  const options = checkedOptions(
    stored,
    unlisted,
    forbidden,
    ownOffered ? own.userId : null,
    listed,
  );
  const selectRenders =
    (query.isPending && !query.isError) ||
    canHoldExecutionKey(query, { mode: 'checked', own }, value);
  return { options, selectRenders, note: checkedNote(query, own), unlisted, ownOffered };
}

/** The lines under the `Select`: the unlisted hint, the own-identity hint and the comparison note. */
function KeyHints({
  own,
  view,
  value,
  hintId,
  noteId,
}: {
  readonly own: OwnIdentity | undefined;
  readonly view: CheckedView;
  readonly value: string;
  readonly hintId: string;
  readonly noteId: string;
}): ReactNode {
  if (own === undefined) return null;
  const keyNote = view.unlisted ? unlistedKeyNote(value, own) : undefined;
  return (
    <>
      {view.unlisted ? (
        <p id={hintId} className="tai-field-hint" style={{ margin: 0 }}>
          <Badge variant="warning">not a listed key</Badge> {unlistedKeyHint(value, own)}
        </p>
      ) : null}
      {view.ownOffered && value === own.userId ? (
        <p id={hintId} className="tai-field-hint" style={{ margin: 0 }}>
          {`This runs as this session's own identity, ${own.userId}, with its live grants.`}
        </p>
      ) : null}
      {keyNote !== undefined ? (
        <p id={noteId} role="status" className="tai-field-hint" style={{ margin: 0 }}>
          <Badge variant="warning">{keyNote.badge}</Badge> {keyNote.text}
        </p>
      ) : null}
    </>
  );
}

/** The ids the `Select` is described by: the hint while one shows, the note while one shows. */
function describedByIds(
  own: OwnIdentity | undefined,
  view: CheckedView,
  value: string,
  hintId: string,
  noteId: string,
): string | undefined {
  if (own === undefined) return undefined;
  const hinted = view.unlisted || (view.ownOffered && value === own.userId);
  const noted = view.unlisted && unlistedKeyNote(value, own) !== undefined;
  const ids = [hinted ? hintId : undefined, noted ? noteId : undefined].filter(
    (id) => id !== undefined,
  );
  return ids.length === 0 ? undefined : ids.join(' ');
}

export function ExecutionKeyPicker({
  query,
  binding,
  value,
  onValueChange,
  error,
  description = DEFAULT_DESCRIPTION,
}: ExecutionKeyPickerProps): ReactNode {
  const hintId = useId();
  const noteId = useId();
  if (binding.mode === 'unchecked') return null;
  if (binding.mode === 'checked' && query.isError && !isForbiddenError(query.error)) {
    return (
      <Field label="Execution key" description={description} group>
        <ErrorState
          message={errorMessage(query.error)}
          onRetry={() => {
            query.refetch();
          }}
        />
      </Field>
    );
  }
  // A pending binding renders the same tree as a pending list, so the control is not
  // remounted when the binding resolves.
  const own = binding.mode === 'checked' ? binding.own : undefined;
  const view = own === undefined ? PENDING_VIEW : checkedView(query, own, value);
  const loading = own === undefined || query.isPending;

  return (
    <Field
      label="Execution key"
      description={description}
      error={view.selectRenders ? error : undefined}
      // Only the Select claims the field's control id; with nothing to hold no
      // labelable element renders, so `for` would dangle.
      group={!view.selectRenders}
    >
      {view.selectRenders ? (
        <Select
          options={view.options}
          value={value}
          placeholder={loading ? 'Loading keys…' : 'Select an execution key'}
          disabled={loading}
          onValueChange={onValueChange}
          aria-describedby={describedByIds(own, view, value, hintId, noteId)}
        />
      ) : null}
      {view.note !== undefined ? <MutedLine text={view.note} /> : null}
      <KeyHints own={own} view={view} value={value} hintId={hintId} noteId={noteId} />
    </Field>
  );
}
