/**
 * The Profiles tab: named settings profiles (e.g. `dev` / `prod`) — full env
 * documents stored server-side, previewed as a diff, and applied to the fleet with
 * one click. It reads `GET /api/config/profiles` (names + descriptions only) and
 * fronts the profile CRUD / diff / apply / version routes.
 *
 * Masking is CLIENT-SIDE (see {@link ProfileVersionsDialog}/{@link DiffDialog}); the
 * secret-mask union masks a value whenever its key is in the profile's own
 * `secret_keys` OR is a registered settings-class secret.
 *
 * VISIBILITY: SettingsPage shows this tab to any caller whose projection reaches the
 * profiles LIST route; the secret/fenced controls (body read, diff, apply, edit,
 * delete, rollback) are admin-only server-side, so a scoped list-only editor sees the
 * list ALONE — every management control is gated on a full (admin) projection here.
 * Config read-only mode further hides the WRITE controls while leaving the diff and
 * version-history READ views available.
 *
 * State follows the shared convention: <Spinner> while loading, a loud <ErrorState>
 * on any failure; every server-supplied string renders as escaped React text.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ErrorState,
  Spinner,
  errorMessage,
  isFullProjection,
  useApi,
  useCapabilities,
} from '@tai42/studio-sdk';

import { settingsProfilesKey, settingsSchemaKey } from './keys';
import { ownedSecretMap } from './settings-secrets';
import { ProfilesTable } from './ProfilesTable';
import { ProfileDialogHost, type OpenDialog } from './ProfileDialogHost';

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

export interface ProfilesTabProps {
  readonly readOnly: boolean;
}

export function ProfilesTab({ readOnly }: ProfilesTabProps): ReactNode {
  const api = useApi();
  const { state: capabilityState } = useCapabilities();

  // The management controls issue secret/fenced calls that are admin-only server-side.
  // A scoped list-only editor (not a full projection) sees the list ALONE, so no
  // control it cannot use ever renders.
  const canManage =
    capabilityState.status === 'ready' && isFullProjection(capabilityState.projection);
  const canWrite = canManage && !readOnly;

  const listQuery = useQuery({
    queryKey: settingsProfilesKey,
    queryFn: ({ signal }) => api.listSettingsProfiles(signal),
  });
  // The secret masks the editor/version views need — only reachable (and only needed)
  // for a manager; a list-only editor opens none of those views.
  const schemaQuery = useQuery({
    queryKey: settingsSchemaKey,
    queryFn: ({ signal }) => api.getSettingsSchema(signal),
    enabled: canManage,
  });

  const [open, setOpen] = useState<OpenDialog | null>(null);
  const close = (): void => {
    setOpen(null);
  };

  if (listQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(listQuery.error)}
        onRetry={() => void listQuery.refetch()}
      />
    );
  }
  if (listQuery.isPending) {
    return <Spinner label="Loading profiles" />;
  }
  // The masks are a manager-only read; surface a schema failure loudly there too.
  if (canManage && schemaQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(schemaQuery.error)}
        onRetry={() => void schemaQuery.refetch()}
      />
    );
  }
  if (canManage && schemaQuery.isPending) {
    return <Spinner label="Loading profiles" />;
  }

  const ownedSecret: ReadonlyMap<string, boolean> =
    schemaQuery.data !== undefined ? ownedSecretMap(schemaQuery.data) : new Map();
  // Reserved `@`-prefixed profiles (e.g. `@previous`) are driven only by the dedicated
  // Revert button — never surfaced as a manageable row.
  const profiles = [...listQuery.data]
    .filter((profile) => !profile.name.startsWith('@'))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={stackStyle}>
      <ProfilesTable
        profiles={profiles}
        canManage={canManage}
        canWrite={canWrite}
        onCreate={() => {
          setOpen({ kind: 'create' });
        }}
        onRevert={() => {
          setOpen({ kind: 'revert' });
        }}
        onDiff={(name) => {
          setOpen({ kind: 'diff', name });
        }}
        onHistory={(name) => {
          setOpen({ kind: 'versions', name });
        }}
        onEdit={(name) => {
          setOpen({ kind: 'edit', name });
        }}
        onApply={(name) => {
          setOpen({ kind: 'apply', name });
        }}
        onDelete={(name) => {
          setOpen({ kind: 'delete', name });
        }}
      />

      <ProfileDialogHost
        open={open}
        ownedSecret={ownedSecret}
        readOnly={readOnly}
        onClose={close}
      />
    </div>
  );
}
