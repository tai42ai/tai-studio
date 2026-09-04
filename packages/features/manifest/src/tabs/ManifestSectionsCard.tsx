/**
 * Granular manifest-section editing on the artifact page (Administration) — the
 * `tools` / `agents` per-entry add-remove doors and the `api_tools` include/exclude
 * list edits, each a thin surface over its server door:
 *
 *  - `POST /api/tools-config/entries` / `DELETE …/{title}` (and the agents twins) —
 *    add or replace one entry by title, or remove one by title.
 *  - `POST /api/api-tools` — add/remove names on the include/exclude lists by delta.
 *
 * There is NO read door for these sections (the manifest read serves only `mcp` +
 * `user_tools`), so this is a deliberate DELTA surface: an entry is added by pasting
 * its JSON (title validated client-side) and removed by naming its title; an api-tools
 * name is added to / removed from a list by name. Every write crosses the config
 * pipeline and reloads the fleet, so a save re-reads the manifest artifact and reports
 * any failed fleet propagation. Removes are destructive and ask the house confirm.
 * Each section renders only for a caller whose projection can reach its door.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Field,
  FleetReport,
  Select,
  Spinner,
  Stack,
  TextInput,
  Textarea,
  errorMessage,
  useApi,
  useCanWrite,
} from '@tai42/studio-sdk';
import { summarizeFleetFanout } from '@tai42/api-client';
import type { ApiClient } from '@tai42/api-client';

import { manifestKey } from '../keys';

/** The apply-result slice these editors render — the fleet fan-out the shared report
 *  handler interprets. The client methods return a wider result (`status`/`env_keys`
 *  too); this names only what the surface reads. */
interface ApplyFanout {
  readonly fanout: Parameters<typeof summarizeFleetFanout>[0];
}

/** Parse the add-entries buffer into a list of entries, each an object carrying a
 *  non-empty `title` string. Accepts a single object or an array of them; anything
 *  else is a loud message (no request is sent). */
function parseEntries(text: string): { entries: unknown[] } | { error: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { error: 'Enter one entry object, or an array of them.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return { error: `Invalid JSON: ${errorMessage(error)}` };
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0) return { error: 'Enter at least one entry.' };
  for (const [index, entry] of list.entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return { error: `Entry ${String(index + 1)} must be a JSON object with a "title".` };
    }
    const title = (entry as Record<string, unknown>).title;
    if (typeof title !== 'string' || title.trim() === '') {
      return { error: `Entry ${String(index + 1)} must carry a non-empty "title" string.` };
    }
  }
  return { entries: list };
}

/** One section's add-entries + remove-by-title surface (tools or agents). The remove
 *  affordance rides its OWN door (a DELETE, distinct from add's POST), so it is gated
 *  separately: `canRemove` withdraws it for a caller whose projection cannot reach it. */
function EntrySectionEditor({
  legend,
  addLabel,
  canRemove,
  add,
  remove,
}: {
  readonly legend: string;
  /** The singular noun for prose ("tool" / "agent"). */
  readonly addLabel: string;
  /** Whether the caller's projection reaches this section's DELETE door. */
  readonly canRemove: boolean;
  readonly add: (entries: unknown[], replace: boolean) => Promise<ApplyFanout>;
  readonly remove: (title: string) => Promise<ApplyFanout>;
}): ReactNode {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const [parseError, setParseError] = useState<string | undefined>(undefined);
  const [removeTitle, setRemoveTitle] = useState('');
  const [confirmTitle, setConfirmTitle] = useState<string | null>(null);

  const invalidate = (): Promise<void> => queryClient.invalidateQueries({ queryKey: manifestKey });

  const addMutation = useMutation({
    mutationFn: (args: { entries: unknown[]; replace: boolean }) => add(args.entries, args.replace),
    onSuccess: async () => {
      await invalidate();
      setText('');
    },
  });
  const removeMutation = useMutation({
    mutationFn: (title: string) => remove(title),
    onSuccess: async () => {
      await invalidate();
      setConfirmTitle(null);
      setRemoveTitle('');
    },
  });

  const onAdd = (): void => {
    const parsed = parseEntries(text);
    if ('error' in parsed) {
      setParseError(parsed.error);
      return;
    }
    setParseError(undefined);
    addMutation.mutate({ entries: parsed.entries, replace });
  };

  const trimmedRemove = removeTitle.trim();

  return (
    <Stack>
      <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>{legend}</h3>
      <Field
        label={`Add ${addLabel} entries`}
        description={`A JSON ${addLabel} entry object, or an array of them. Each needs a unique "title".`}
        error={parseError}
      >
        <Textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          rows={5}
          spellCheck={false}
          style={{ fontFamily: 'var(--tai-font-mono)' }}
        />
      </Field>
      <label style={{ display: 'flex', gap: 'var(--tai-space-2)', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={replace}
          onChange={(event) => {
            setReplace(event.target.checked);
          }}
        />
        <span style={{ fontSize: 'var(--tai-text-sm)' }}>
          Replace an existing {addLabel} entry with the same title
        </span>
      </label>
      <div style={{ display: 'flex', gap: 'var(--tai-space-3)', alignItems: 'center' }}>
        <Button type="button" variant="primary" disabled={addMutation.isPending} onClick={onAdd}>
          {addMutation.isPending ? <Spinner label={`Adding ${addLabel} entries`} /> : null}
          Add {addLabel} entries
        </Button>
        {addMutation.isSuccess ? <Badge variant="success">Added</Badge> : null}
      </div>
      {addMutation.isError ? <ErrorState message={errorMessage(addMutation.error)} /> : null}
      {addMutation.isSuccess ? (
        <FleetReport summary={summarizeFleetFanout(addMutation.data.fanout)} />
      ) : null}

      {/* The remove door (a DELETE) is gated apart from add — a caller who can add but
          not delete is never shown a remove control that can only 403 on submit. */}
      {canRemove ? (
        <>
          <Field label={`Remove ${addLabel} entry`} description="The title of the entry to remove.">
            <TextInput
              value={removeTitle}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setRemoveTitle(event.target.value);
              }}
            />
          </Field>
          <div>
            <Button
              type="button"
              variant="danger"
              disabled={trimmedRemove === ''}
              onClick={() => {
                removeMutation.reset();
                setConfirmTitle(trimmedRemove);
              }}
            >
              Remove {addLabel} entry
            </Button>
          </div>
          {removeMutation.isSuccess ? (
            <FleetReport summary={summarizeFleetFanout(removeMutation.data.fanout)} />
          ) : null}

          {confirmTitle !== null ? (
            <ConfirmDialog
              title={`Remove ${addLabel} entry`}
              confirmLabel={`Remove ${addLabel} entry`}
              pendingLabel={`Removing ${confirmTitle}`}
              onConfirm={() => {
                removeMutation.mutate(confirmTitle);
              }}
              onClose={() => {
                setConfirmTitle(null);
              }}
              isPending={removeMutation.isPending}
              error={removeMutation.error}
            >
              <p style={{ margin: 0 }}>
                Remove the {addLabel} entry{' '}
                <strong style={{ fontFamily: 'var(--tai-font-mono)' }}>{confirmTitle}</strong> from
                the manifest? This reloads the fleet.
              </p>
            </ConfirmDialog>
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}

type ApiToolsList = 'include' | 'exclude';
type ApiToolsAction = 'add' | 'remove';

/** The api_tools include/exclude list editor: add/remove one name on either list by
 *  delta (there is no read of the current lists, so this edits by name). */
function ApiToolsEditor({ api }: { readonly api: ApiClient }): ReactNode {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [list, setList] = useState<ApiToolsList>('include');

  const edit = useMutation({
    mutationFn: (args: { list: ApiToolsList; action: ApiToolsAction; name: string }) => {
      const field = `${args.list}_${args.action}` as const;
      return api.updateApiTools({ [field]: [args.name] });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: manifestKey });
      setName('');
    },
  });

  const trimmed = name.trim();
  const run = (action: ApiToolsAction): void => {
    if (trimmed === '') return;
    edit.mutate({ list, action, name: trimmed });
  };

  return (
    <Stack>
      <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>API tools</h3>
      <p className="tai-muted" style={{ margin: 0, fontSize: 'var(--tai-text-sm)' }}>
        Curate which operations the api_tools surface projects. Add or remove one name on the
        include or exclude list.
      </p>
      <Field label="Operation name">
        <TextInput
          value={name}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      <Field label="List">
        <Select
          aria-label="List"
          value={list}
          onValueChange={(next) => {
            setList(next as ApiToolsList);
          }}
          options={[
            { value: 'include', label: 'Include' },
            { value: 'exclude', label: 'Exclude' },
          ]}
        />
      </Field>
      <div style={{ display: 'flex', gap: 'var(--tai-space-3)', alignItems: 'center' }}>
        <Button
          type="button"
          variant="primary"
          disabled={trimmed === '' || edit.isPending}
          onClick={() => {
            run('add');
          }}
        >
          {edit.isPending ? <Spinner label="Updating api_tools" /> : null}
          Add name
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={trimmed === '' || edit.isPending}
          onClick={() => {
            run('remove');
          }}
        >
          Remove name
        </Button>
        {edit.isSuccess ? <Badge variant="success">Updated</Badge> : null}
      </div>
      {edit.isError ? <ErrorState message={errorMessage(edit.error)} /> : null}
      {edit.isSuccess ? <FleetReport summary={summarizeFleetFanout(edit.data.fanout)} /> : null}
    </Stack>
  );
}

/**
 * The manifest-sections editor card: granular per-entry add/remove for the `tools` and
 * `agents` sections plus the `api_tools` list edits. Each section is gated on its own
 * write door; the card renders only when at least one is reachable.
 */
export function ManifestSectionsCard(): ReactNode {
  const api = useApi();
  const canTools = useCanWrite('/api/tools-config/entries', 'POST');
  const canAgents = useCanWrite('/api/agents-config/entries', 'POST');
  const canApiTools = useCanWrite('/api/api-tools', 'POST');
  // Remove rides a DYNAMIC per-title door (`DELETE /api/{…}-config/entries/{title}`),
  // distinct from add's POST. A dynamic route is not method-expressible in a scoped
  // projection, so — following the house approach for a templated write route — the
  // interpolated path resolves to a full-projection gate; under-showing a scoped
  // caller's remove is safe (projection ⊆ gate).
  const canRemoveTools = useCanWrite('/api/tools-config/entries/{title}', 'DELETE');
  const canRemoveAgents = useCanWrite('/api/agents-config/entries/{title}', 'DELETE');

  if (!canTools && !canAgents && !canApiTools) return null;

  return (
    <Card>
      <Stack gap={6}>
        <div>
          <h2 style={{ margin: 0, fontSize: 'var(--tai-text-lg)' }}>Manifest sections</h2>
          <p className="tai-muted" style={{ margin: 0, fontSize: 'var(--tai-text-sm)' }}>
            Add or remove individual entries in the manifest&apos;s configuration sections. Each
            change persists and reloads the fleet.
          </p>
        </div>
        {canTools ? (
          <EntrySectionEditor
            legend="Tools"
            addLabel="tool"
            canRemove={canRemoveTools}
            add={(entries, replace) => api.addToolsEntries(entries, replace)}
            remove={(title) => api.removeToolsEntry(title)}
          />
        ) : null}
        {canAgents ? (
          <EntrySectionEditor
            legend="Agents"
            addLabel="agent"
            canRemove={canRemoveAgents}
            add={(entries, replace) => api.addAgentsEntries(entries, replace)}
            remove={(title) => api.removeAgentsEntry(title)}
          />
        ) : null}
        {canApiTools ? <ApiToolsEditor api={api} /> : null}
      </Stack>
    </Card>
  );
}
