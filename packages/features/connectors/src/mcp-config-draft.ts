/**
 * The MCP config editor's state machine, as hooks: the two-view working-list draft
 * (form ⇄ JSON), the combined secret-paste op, the manifest save with its
 * session-generated orphan-key sweep, and the composed hook the editor consumes.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@tai42/api-client';
import type { RefObject } from 'react';
import { useRef, useState } from 'react';
import { useApi, useCanWrite, useRegisterDirty } from '@tai42/studio-sdk';

import { envConfigKey, manifestKey, mcpStatusKey, preservedManifestKey } from './keys';
import { collectEnvRefs, parseEnvMarker, resolveManifestPointer } from './mcp-env-markers';
import { parseEntries } from './mcp-config-parse';

export type ConfigView = 'form' | 'json';

/** How many times the paste's confirmation read retries the gate's retriable 503 before
 *  it gives up and raises. A fleet reload holds the gate for a few seconds per cycle. */
const RELOAD_RETRIES = 10;

/** The wait between those retries when the refusal named no `Retry-After`. */
const DEFAULT_RETRY_SECONDS = 2;

export interface SecretPaste {
  readonly onPasteSecret: (manifestPointer: string, keyHint: string, secret: string) => void;
  readonly secretStoreBlockedReason: string | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
}

/**
 * The combined env+manifest op for a PASTED secret: the server writes the env value
 * FIRST, then the `!ENV ${KEY}` manifest leaf at `manifest_pointer` (head `mcp`)
 * SECOND — atomically, one reload/broadcast. On success the generated key rides back
 * on an AUTHORITATIVE preserved re-read (the op's response carries only a COUNT), and
 * it is recorded here as the sole key the save-time orphan sweep may delete. While the
 * op is storing — or has failed to confirm — no second paste and no save may run: the
 * draft still carries the leaf the server is replacing.
 */
export function useSecretPasteMutation(
  sessionGeneratedKeysRef: RefObject<Set<string>>,
): SecretPaste {
  const api = useApi();
  const queryClient = useQueryClient();

  const secretEnv = useMutation({
    mutationFn: (body: Parameters<typeof api.setMcpSecretEnv>[0]) => api.setMcpSecretEnv(body),
    onSuccess: async (_result, variables) => {
      // CONFIRM the paste against an AUTHORITATIVE re-read before anything else. The op's
      // response carries a COUNT, not the generated name, so the only way to learn the key
      // is the preserved manifest's leaf at the paste pointer — and it is the sole key the
      // save-time orphan sweep may ever delete. `fetchQuery` raises when that read fails
      // (an invalidation would swallow the failure and leave the stale, pre-paste manifest
      // in the cache), retrying the gate's retriable 503 on the delay it names. Raising
      // here fails the mutation, which keeps the Save and paste doors shut over a draft
      // that still carries the pre-paste leaf and tells the operator so.
      const preserved = await queryClient.fetchQuery({
        queryKey: preservedManifestKey,
        queryFn: ({ signal }) => api.getManifestPreserved(signal),
        staleTime: 0,
        retry: (failureCount, error) =>
          failureCount < RELOAD_RETRIES && error instanceof ApiError && error.status === 503,
        retryDelay: (_attempt, error) =>
          (error instanceof ApiError && error.retryAfterSeconds !== undefined
            ? error.retryAfterSeconds
            : DEFAULT_RETRY_SECONDS) * 1000,
      });
      const generatedKey = parseEnvMarker(
        resolveManifestPointer(preserved, variables.manifest_pointer),
      );
      if (generatedKey === null) {
        throw new Error(
          'The secret was stored, but the manifest read back does not carry its reference. ' +
            'Reload the page to continue from the configuration the server holds.',
        );
      }
      sessionGeneratedKeysRef.current.add(generatedKey);
      await queryClient.invalidateQueries({ queryKey: envConfigKey });
      await queryClient.invalidateQueries({ queryKey: manifestKey });
      await queryClient.invalidateQueries({ queryKey: mcpStatusKey });
    },
  });

  const secretStoreBlockedReason = secretEnv.isPending
    ? 'Storing the previous secret'
    : secretEnv.isError
      ? 'A stored secret could not be confirmed — reload the page'
      : undefined;

  const onPasteSecret = (manifestPointer: string, keyHint: string, secret: string): void => {
    secretEnv.mutate({ value: secret, key_hint: keyHint, manifest_pointer: manifestPointer });
  };

  return {
    onPasteSecret,
    secretStoreBlockedReason,
    isPending: secretEnv.isPending,
    isError: secretEnv.isError,
    error: secretEnv.error,
  };
}

/**
 * The manifest save with its orphan cleanup: MANIFEST-FIRST, so the marker is dropped
 * from the manifest before its generated env key is deleted (the window can only ever
 * hold an inert orphan key, never a dangling `!ENV`). A save moves both manifest views
 * (and the env config only when a generated key was swept), so it re-reads each.
 */
export function useMcpSaveMutation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ mcp, orphanedKeys }: { mcp: unknown[]; orphanedKeys: string[] }) => {
      // The delete rides the env editor's blank-value path.
      const result = await api.setMcpConfig(mcp);
      for (const key of orphanedKeys) await api.setEnvConfig({ [key]: '' });
      return result;
    },
    onSuccess: async (_result, { orphanedKeys }) => {
      await queryClient.invalidateQueries({ queryKey: preservedManifestKey });
      await queryClient.invalidateQueries({ queryKey: manifestKey });
      await queryClient.invalidateQueries({ queryKey: mcpStatusKey });
      if (orphanedKeys.length > 0) {
        await queryClient.invalidateQueries({ queryKey: envConfigKey });
      }
    },
  });
}

export interface ConfigDraft {
  readonly view: ConfigView;
  readonly entries: unknown[];
  readonly setEntries: (entries: unknown[]) => void;
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly parseError: string | undefined;
  readonly setParseError: (error: string | undefined) => void;
  readonly confirmTarget: ConfigView | null;
  readonly setConfirmTarget: (target: ConfigView | null) => void;
  readonly conflict: boolean;
  readonly dirty: boolean;
  readonly baseline: string;
  readonly loadServerVersion: () => void;
  readonly requestView: (next: ConfigView) => void;
  readonly switchTo: (next: ConfigView) => void;
}

/**
 * The two-view working-list draft. The FORM view drives `entries`; the JSON view
 * drives `text`; a view switch converts one into the other so neither goes stale. A
 * server-side move (a save that normalizes the config, or a background refetch) is
 * ADOPTED only when it is safe — the draft carries no unsaved edits, or already equals
 * the new server config; a move landing under differing unsaved edits is a CONFLICT the
 * draft keeps and surfaces rather than clobbering.
 */
export function useConfigDraftState(
  initialEntries: readonly Record<string, unknown>[],
): ConfigDraft {
  const baseline = JSON.stringify(initialEntries);
  const [view, setView] = useState<ConfigView>('form');
  const [entries, setEntries] = useState<unknown[]>(() => [...initialEntries]);
  const [text, setText] = useState(() => JSON.stringify(initialEntries, null, 2));
  const [parseError, setParseError] = useState<string | undefined>(undefined);
  const [confirmTarget, setConfirmTarget] = useState<ConfigView | null>(null);
  const [conflict, setConflict] = useState(false);

  // The signature of the current working list in whichever view is active, comparable
  // to `baseline`/`seededFrom`. An unparseable JSON buffer is its own signature so it
  // counts as diverged, never as a silent match.
  const draftSignature = ((): string => {
    if (view === 'form') return JSON.stringify(entries);
    const parsed = parseEntries(text);
    return 'error' in parsed ? `error:${text}` : JSON.stringify(parsed.entries);
  })();

  const loadServerVersion = (): void => {
    setEntries([...initialEntries]);
    setText(JSON.stringify(initialEntries, null, 2));
    setParseError(undefined);
    setConflict(false);
  };

  // The buffers are re-seeded when the server config MOVES during render (React's
  // adjust-state-on-prop-change pattern) rather than by remounting on a `key`: this
  // editor is what writes the config, so a remount keyed on it would tear the editor
  // down the instant its own save lands, dropping the keyboard caret and the "Saved"
  // badge/fleet report. Re-seeding leaves the operator in the view they chose.
  const [seededFrom, setSeededFrom] = useState(baseline);
  if (seededFrom !== baseline) {
    const adopt = draftSignature === seededFrom || draftSignature === baseline;
    setSeededFrom(baseline);
    if (adopt) loadServerVersion();
    else setConflict(true);
  }

  const dirty = draftSignature !== baseline;

  // Perform the actual switch, converting the working list across. A JSON→form switch
  // with an unparseable buffer stays in JSON and raises loudly rather than dropping the
  // edit.
  const switchTo = (next: ConfigView): void => {
    if (next === 'json') {
      setText(JSON.stringify(entries, null, 2));
      setParseError(undefined);
      setView('json');
      return;
    }
    const parsed = parseEntries(text);
    if ('error' in parsed) {
      setParseError(parsed.error);
      return;
    }
    setEntries(parsed.entries);
    setParseError(undefined);
    setView('form');
  };

  const requestView = (next: ConfigView): void => {
    if (next === view) return;
    if (dirty) {
      setConfirmTarget(next);
      return;
    }
    switchTo(next);
  };

  return {
    view,
    entries,
    setEntries,
    text,
    setText,
    parseError,
    setParseError,
    confirmTarget,
    setConfirmTarget,
    conflict,
    dirty,
    baseline,
    loadServerVersion,
    requestView,
    switchTo,
  };
}

export interface McpConfigDraft extends ConfigDraft {
  readonly canSave: boolean;
  readonly onPasteSecret: SecretPaste['onPasteSecret'];
  readonly secretStoreBlockedReason: string | undefined;
  readonly secretEnvPending: boolean;
  readonly secretEnvError: boolean;
  readonly secretEnvErrorObj: unknown;
  readonly save: ReturnType<typeof useMcpSaveMutation>;
  readonly onSave: () => void;
}

/**
 * The composed editor draft the config editor consumes: the working-list state, the
 * secret paste, the save mutation, the dirty-guard registration, and the save handler
 * that computes the session-generated orphan keys this save strands (a key referenced
 * before but not after AND generated by this editor's own paste — never a picked,
 * pre-existing, or another-session key).
 */
export function useMcpConfigDraft({
  initialEntries,
}: {
  readonly initialEntries: readonly Record<string, unknown>[];
}): McpConfigDraft {
  const canSave = useCanWrite('/api/mcp-config', 'POST');
  // The exact env keys THIS editor generated through its own pastes — the sole set the
  // save-time orphan sweep may delete.
  const sessionGeneratedKeysRef = useRef<Set<string>>(new Set());
  const paste = useSecretPasteMutation(sessionGeneratedKeysRef);
  const save = useMcpSaveMutation();
  const draft = useConfigDraftState(initialEntries);

  useRegisterDirty(draft.dirty);

  const orphanedKeysOf = (next: unknown[]): string[] => {
    const before = collectEnvRefs(initialEntries);
    const after = collectEnvRefs(next);
    return [...before].filter((key) => !after.has(key) && sessionGeneratedKeysRef.current.has(key));
  };

  const onSave = (): void => {
    if (draft.view === 'json') {
      const parsed = parseEntries(draft.text);
      if ('error' in parsed) {
        draft.setParseError(parsed.error);
        return;
      }
      draft.setParseError(undefined);
      save.mutate({ mcp: parsed.entries, orphanedKeys: orphanedKeysOf(parsed.entries) });
      return;
    }
    save.mutate({ mcp: draft.entries, orphanedKeys: orphanedKeysOf(draft.entries) });
  };

  return {
    ...draft,
    canSave,
    onPasteSecret: paste.onPasteSecret,
    secretStoreBlockedReason: paste.secretStoreBlockedReason,
    secretEnvPending: paste.isPending,
    secretEnvError: paste.isError,
    secretEnvErrorObj: paste.error,
    save,
    onSave,
  };
}
