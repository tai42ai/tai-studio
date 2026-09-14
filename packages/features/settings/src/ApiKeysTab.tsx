/**
 * The API keys tab: provisions and manages the deployment's API keys and the
 * scope → URL map the policy enforcer reads.
 *
 * Keys: a table of every key's payload (user_id, description, scopes) from
 * `listTokensPayload`. Creating a key returns the raw `sk-…` string ONCE; it is
 * shown in a copy box with a warning and is never stored client-side beyond that
 * dialog's lifetime. Editing changes description + scopes; revoking deletes the key
 * after a confirm.
 *
 * Access control: the scope ↔ URL map is managed by the `ScopesMapper` — it mounts
 * admin reads, so it is shown only to a caller whose projection reaches every one of
 * them; a scoped own-key caller sees only the keys table above.
 *
 * Every server-supplied string renders as ESCAPED text through the design-system
 * components. Failures surface loudly through <ErrorState>. Read-only config mode
 * disables every mutation.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  ErrorState,
  Spinner,
  errorMessage,
  useApi,
  useCanWrite,
  useCapabilities,
} from '@tai42/studio-sdk';

import { authCapabilitiesKey, scopesKey, tokensPayloadKey } from './keys';
import { PolicyVersionsDialog } from './PolicyVersionsDialog';
import { ScopesMapper } from './ScopesMapper';
import type { KeyPayload } from './key-owner';
import {
  MINT_ROUTE,
  mintableScopeIds,
  projectionCanMint,
  scopeIdsOf,
  scopesMapperVisible,
} from './api-keys-gating';
import { KeysTable } from './KeysTable';
import { CreateKeyDialog } from './CreateKeyDialog';
import { MintedKeyDialog } from './MintedKeyDialog';
import { EditKeyDialog } from './EditKeyDialog';
import { RevokeKeyDialog } from './RevokeKeyDialog';

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const createGateStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 'var(--tai-space-1)',
};

const createNoteStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

/**
 * The keys-card header control. Hidden in readOnly; a non-mintable deployment shows
 * the external-issuer note; a mintable deployment the caller cannot mint on shows a
 * short access note; only when both hold does the Create button render.
 */
function CreateKeyControl({
  readOnly,
  deploymentMintable,
  projectionMintable,
  onCreate,
}: {
  readonly readOnly: boolean;
  readonly deploymentMintable: boolean;
  readonly projectionMintable: boolean;
  readonly onCreate: () => void;
}): ReactNode {
  if (readOnly) return null;
  if (!deploymentMintable) {
    return (
      <div style={createGateStyle}>
        <Button type="button" variant="primary" disabled>
          Create key
        </Button>
        <span style={createNoteStyle}>Keys are managed at the external issuer</span>
      </div>
    );
  }
  if (!projectionMintable) {
    return <span style={createNoteStyle}>Your access does not permit minting keys.</span>;
  }
  return (
    <Button type="button" variant="primary" onClick={onCreate}>
      Create key
    </Button>
  );
}

/** The create / minted / edit / revoke / policy-history dialogs; at most one is open. */
function ApiKeysDialogHost({
  canMint,
  createOpen,
  onCreateOpenChange,
  dialogScopeIds,
  onMinted,
  mintedKey,
  editPayload,
  revokeUser,
  policyUser,
  scopeIds,
  readOnly,
  onClose,
}: {
  readonly canMint: boolean;
  readonly createOpen: boolean;
  readonly onCreateOpenChange: (open: boolean) => void;
  readonly dialogScopeIds: readonly string[];
  readonly onMinted: (apiKey: string) => void;
  readonly mintedKey: string | null;
  readonly editPayload: KeyPayload | null;
  readonly revokeUser: string | null;
  readonly policyUser: string | null;
  readonly scopeIds: readonly string[];
  readonly readOnly: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <>
      {canMint ? (
        <CreateKeyDialog
          open={createOpen}
          onOpenChange={onCreateOpenChange}
          scopeIds={dialogScopeIds}
          onMinted={onMinted}
        />
      ) : null}
      {mintedKey !== null ? <MintedKeyDialog apiKey={mintedKey} onClose={onClose} /> : null}
      {editPayload !== null ? (
        <EditKeyDialog
          key={editPayload.user_id}
          payload={editPayload}
          scopeIds={scopeIds}
          onClose={onClose}
        />
      ) : null}
      {revokeUser !== null ? <RevokeKeyDialog userId={revokeUser} onClose={onClose} /> : null}
      {policyUser !== null ? (
        <PolicyVersionsDialog userId={policyUser} readOnly={readOnly} onClose={onClose} />
      ) : null}
    </>
  );
}

export interface ApiKeysTabProps {
  readonly readOnly: boolean;
}

export function ApiKeysTab({ readOnly }: ApiKeysTabProps): ReactNode {
  const api = useApi();
  const { state: capabilityState } = useCapabilities();
  const canMintRoute = useCanWrite(MINT_ROUTE, 'POST');

  const keysQuery = useQuery({
    queryKey: tokensPayloadKey,
    queryFn: ({ signal }) => api.listTokensPayload(signal),
  });
  const scopesQuery = useQuery({
    queryKey: scopesKey,
    queryFn: ({ signal }) => api.listScopes(signal),
  });
  // Whether this deployment can MINT keys locally. Fetched only when the create
  // path can render (a read-only viewer never consumes it), so a failing
  // capabilities endpoint never blocks the key list they can still view.
  const capabilitiesQuery = useQuery({
    queryKey: authCapabilitiesKey,
    queryFn: ({ signal }) => api.getAuthCapabilities(signal),
    enabled: !readOnly,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [mintedKey, setMintedKey] = useState<string | null>(null);
  const [editPayload, setEditPayload] = useState<KeyPayload | null>(null);
  const [revokeUser, setRevokeUser] = useState<string | null>(null);
  const [policyUser, setPolicyUser] = useState<string | null>(null);

  // The capabilities query is disabled (perpetually pending, never failed) in
  // readOnly mode, so it only joins the whole-tab gates for the mint path.
  if (keysQuery.isError || scopesQuery.isError || (!readOnly && capabilitiesQuery.isError)) {
    const error = keysQuery.error ?? scopesQuery.error ?? capabilitiesQuery.error;
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => {
          void keysQuery.refetch();
          void scopesQuery.refetch();
          void capabilitiesQuery.refetch();
        }}
      />
    );
  }
  if (keysQuery.isPending || scopesQuery.isPending || (!readOnly && capabilitiesQuery.isPending)) {
    return <Spinner label="Loading API keys" />;
  }

  const keys = keysQuery.data;
  const scopes = scopesQuery.data;
  const scopeIds = scopeIdsOf(scopes);
  // Whether THIS deployment can mint locally (validator-only deployments cannot);
  // absent in readOnly mode, where the create control is hidden.
  const deploymentMintable = !readOnly && capabilitiesQuery.data?.mintable === true;
  const projectionMintable = projectionCanMint(capabilityState, canMintRoute);
  const canMint = deploymentMintable && projectionMintable;
  const dialogScopeIds = mintableScopeIds(scopeIds, capabilityState);

  return (
    <div style={stackStyle}>
      <KeysTable
        keys={keys}
        readOnly={readOnly}
        headerAction={
          <CreateKeyControl
            readOnly={readOnly}
            deploymentMintable={deploymentMintable}
            projectionMintable={projectionMintable}
            onCreate={() => {
              setCreateOpen(true);
            }}
          />
        }
        onEdit={setEditPayload}
        onHistory={setPolicyUser}
        onRevoke={setRevokeUser}
      />

      {scopesMapperVisible(capabilityState) ? (
        <ScopesMapper scopes={scopes} readOnly={readOnly} />
      ) : null}

      <ApiKeysDialogHost
        canMint={canMint}
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
        dialogScopeIds={dialogScopeIds}
        onMinted={setMintedKey}
        mintedKey={mintedKey}
        editPayload={editPayload}
        revokeUser={revokeUser}
        policyUser={policyUser}
        scopeIds={scopeIds}
        readOnly={readOnly}
        onClose={() => {
          setMintedKey(null);
          setEditPayload(null);
          setRevokeUser(null);
          setPolicyUser(null);
        }}
      />
    </div>
  );
}
