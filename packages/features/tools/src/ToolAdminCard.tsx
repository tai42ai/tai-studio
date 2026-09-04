/**
 * App-tool live-registry administration — the `POST /api/tools/reload` and
 * `POST /api/tools/remove` doors surfaced on the Tools page. Each re-registers or
 * removes ONE app tool from the running registry by its reloader `kind` (the key a
 * plugin registered its reloader under, e.g. `example_tool`) and `name`, applied on
 * this worker and broadcast to the fleet.
 *
 * The identifying `kind` is not carried by any catalog read the Studio can enumerate,
 * so this is a deliberate power-user FORM (kind + name) rather than a per-row button:
 * the operator names the tool to act on. Reload is non-destructive; Remove detaches a
 * live tool, so it asks the house confirm first. Both are fenced server-side; a refusal
 * (unknown kind, reload-gated) surfaces loudly. The card only renders for a caller whose
 * projection can reach the fenced doors.
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
  Spinner,
  Stack,
  TextInput,
  errorMessage,
  useApi,
  useCanWrite,
} from '@tai42/studio-sdk';
import { summarizeFleetResult } from '@tai42/api-client';
import type { ToolAdminArgs } from '@tai42/api-client';

import { toolMetaKey, toolsListKey } from './keys';

/** The fenced live-registry doors — each gated on its OWN route. */
const TOOL_RELOAD_ROUTE = '/api/tools/reload';
const TOOL_REMOVE_ROUTE = '/api/tools/remove';

export function ToolAdminCard(): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  // Reload and Remove are SEPARATE doors; each affordance gates on its own route so a
  // caller fenced to one is never shown the other (a door that can only refuse is never
  // offered). The card renders when EITHER is reachable.
  const canReload = useCanWrite(TOOL_RELOAD_ROUTE, 'POST');
  const canRemove = useCanWrite(TOOL_REMOVE_ROUTE, 'POST');
  const [kind, setKind] = useState('');
  const [name, setName] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  // The live registry moved, so the catalog list + the overlay re-read on success.
  const invalidateCatalog = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: toolsListKey });
    await queryClient.invalidateQueries({ queryKey: toolMetaKey });
  };

  const reload = useMutation({
    mutationFn: (args: ToolAdminArgs) => api.reloadTool(args),
    onSuccess: invalidateCatalog,
  });
  const remove = useMutation({
    mutationFn: (args: ToolAdminArgs) => api.removeTool(args),
    onSuccess: async () => {
      await invalidateCatalog();
      setConfirmRemove(false);
    },
  });

  // A card whose every door can only refuse is never offered.
  if (!canReload && !canRemove) return null;

  const trimmedKind = kind.trim();
  const trimmedName = name.trim();
  const ready = trimmedKind !== '' && trimmedName !== '';
  const args: ToolAdminArgs = { kind: trimmedKind, name: trimmedName };

  return (
    <Card>
      <Stack>
        <h2 className="tai-card-title">App tool administration</h2>
        <p className="tai-muted" style={{ margin: 0, fontSize: 'var(--tai-text-sm)' }}>
          Reload re-registers one app tool from its stored definition; Remove detaches it from the
          live registry. Name the tool by its reloader kind and name.
        </p>
        <Field label="Kind" description="The tool reloader kind (e.g. example_tool).">
          <TextInput
            value={kind}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setKind(event.target.value);
            }}
          />
        </Field>
        <Field label="Name" description="The tool name within that kind.">
          <TextInput
            value={name}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </Field>
        <div style={{ display: 'flex', gap: 'var(--tai-space-3)', alignItems: 'center' }}>
          {canReload ? (
            <Button
              type="button"
              variant="primary"
              disabled={!ready || reload.isPending}
              onClick={() => {
                reload.mutate(args);
              }}
            >
              {reload.isPending ? <Spinner label="Reloading tool" /> : null}
              Reload tool
            </Button>
          ) : null}
          {canRemove ? (
            <Button
              type="button"
              variant="danger"
              disabled={!ready}
              onClick={() => {
                // A shared mutation drives the confirm, so clear any stale error before
                // opening (the reset-on-open precedent).
                remove.reset();
                setConfirmRemove(true);
              }}
            >
              Remove tool
            </Button>
          ) : null}
          {reload.isSuccess ? <Badge variant="success">Reloaded</Badge> : null}
        </div>
        {reload.isError ? <ErrorState message={errorMessage(reload.error)} /> : null}
        {/* Each op broadcasts a registry change to the fleet; surface any failed
            propagation honestly (nothing on a converged / lone-worker op). */}
        {reload.isSuccess ? (
          <FleetReport summary={summarizeFleetResult(reload.data)} action="reload" />
        ) : null}
        {remove.isSuccess ? (
          <FleetReport summary={summarizeFleetResult(remove.data)} action="remove" />
        ) : null}
      </Stack>
      {confirmRemove ? (
        <ConfirmDialog
          title="Remove app tool"
          confirmLabel="Remove tool"
          pendingLabel={`Removing ${trimmedName}`}
          onConfirm={() => {
            remove.mutate(args);
          }}
          onClose={() => {
            setConfirmRemove(false);
          }}
          isPending={remove.isPending}
          error={remove.error}
        >
          <p style={{ margin: 0 }}>
            Remove <strong style={{ fontFamily: 'var(--tai-font-mono)' }}>{trimmedName}</strong>{' '}
            (kind <strong style={{ fontFamily: 'var(--tai-font-mono)' }}>{trimmedKind}</strong>)
            from the live registry? Reload it to bring it back.
          </p>
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}
