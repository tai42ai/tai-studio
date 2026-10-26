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
 * components. Failures surface loudly through <ErrorState>. Creating, editing and
 * revoking keys needs the caller's mint grant (its access reaches
 * `POST /api/auth/api-keys`; an owned key never mints); without it the tab lists the
 * caller's keys and a status line says minting is not permitted.
 */
import type { PrincipalRef } from '@tai42/api-client';
import {
  Button,
  errorMessage,
  ErrorState,
  Spinner,
  useApi,
  useCanWrite,
  useCapabilities,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useState } from 'react';

import {
  canGrantFullAccess,
  MINT_ROUTE,
  mintableScopeIds,
  POLICY_VERSIONS_ROUTE,
  projectionCanMint,
  scopeIdsOf,
  scopesMapperVisible,
} from './api-keys-gating';
import { CreateKeyDialog } from './CreateKeyDialog';
import { EditKeyDialog } from './EditKeyDialog';
import type { KeyPayload } from './key-owner';
import { authCapabilitiesKey, scopesKey, tokensPayloadKey } from './keys';
import { KeysTable } from './KeysTable';
import { MintedKeyDialog } from './MintedKeyDialog';
import { PolicyVersionsDialog } from './PolicyVersionsDialog';
import { RevokeKeyDialog } from './RevokeKeyDialog';
import { ScopesMapper } from './ScopesMapper';

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
 * The keys-card header control. Without the mint grant, a status line says minting is
 * not permitted; with it, a non-mintable deployment shows the disabled control and the
 * external-issuer note; otherwise the Create button renders.
 */
function CreateKeyControl({
  canWriteKeys,
  deploymentMintable,
  onCreate,
}: {
  readonly canWriteKeys: boolean;
  readonly deploymentMintable: boolean;
  readonly onCreate: () => void;
}): ReactNode {
  if (!canWriteKeys) {
    return (
      <span role="status" className="tai-muted">
        Your access does not permit minting keys.
      </span>
    );
  }
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
  fullAccessAvailable,
  onMinted,
  minted,
  editPayload,
  revokeUser,
  policyUser,
  scopeIds,
  publicId,
  readOnly,
  onClose,
}: {
  readonly canMint: boolean;
  readonly createOpen: boolean;
  readonly onCreateOpenChange: (open: boolean) => void;
  readonly dialogScopeIds: readonly string[];
  readonly fullAccessAvailable: boolean;
  readonly onMinted: (apiKey: string, principal: PrincipalRef | null) => void;
  readonly minted: { readonly apiKey: string; readonly principal: PrincipalRef | null } | null;
  readonly editPayload: KeyPayload | null;
  readonly revokeUser: string | null;
  readonly policyUser: string | null;
  readonly scopeIds: readonly string[];
  readonly publicId: string;
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
          fullAccessAvailable={fullAccessAvailable}
          onMinted={onMinted}
        />
      ) : null}
      {minted !== null ? (
        <MintedKeyDialog apiKey={minted.apiKey} principal={minted.principal} onClose={onClose} />
      ) : null}
      {editPayload !== null ? (
        <EditKeyDialog
          key={editPayload.user_id}
          payload={editPayload}
          scopeIds={scopeIds}
          publicId={publicId}
          fullAccessAvailable={fullAccessAvailable}
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
  /** The deployment's public marker, served on the caller's projection — never a scope. */
  readonly publicId: string;
}

export function ApiKeysTab({ publicId }: ApiKeysTabProps): ReactNode {
  const api = useApi();
  const { state: capabilityState } = useCapabilities();
  const canWriteKeys = projectionCanMint(capabilityState, useCanWrite(MINT_ROUTE, 'POST'));
  const canReadHistory = useCanWrite(POLICY_VERSIONS_ROUTE, 'GET');

  const keysQuery = useQuery({
    queryKey: tokensPayloadKey,
    queryFn: ({ signal }) => api.listTokensPayload(signal),
  });
  const scopesQuery = useQuery({
    queryKey: scopesKey,
    queryFn: ({ signal }) => api.listScopes(signal),
  });
  // Whether this deployment can MINT keys locally. Fetched only with the mint grant
  // (a caller without it never consumes it), so a failing capabilities endpoint never
  // blocks the key list they can still view.
  const capabilitiesQuery = useQuery({
    queryKey: authCapabilitiesKey,
    queryFn: ({ signal }) => api.getAuthCapabilities(signal),
    enabled: canWriteKeys,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [minted, setMinted] = useState<{
    readonly apiKey: string;
    readonly principal: PrincipalRef | null;
  } | null>(null);
  const [editPayload, setEditPayload] = useState<KeyPayload | null>(null);
  const [revokeUser, setRevokeUser] = useState<string | null>(null);
  const [policyUser, setPolicyUser] = useState<string | null>(null);

  // The capabilities query is disabled (perpetually pending, never failed) without
  // the mint grant, so it only joins the whole-tab gates with the grant.
  if (keysQuery.isError || scopesQuery.isError || (canWriteKeys && capabilitiesQuery.isError)) {
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
  if (
    keysQuery.isPending ||
    scopesQuery.isPending ||
    (canWriteKeys && capabilitiesQuery.isPending)
  ) {
    return <Spinner label="Loading API keys" />;
  }

  const keys = keysQuery.data;
  const scopes = scopesQuery.data;
  const scopeIds = scopeIdsOf(scopes, publicId);
  // Whether THIS deployment can mint locally (validator-only deployments cannot);
  // read only with the mint grant.
  const deploymentMintable = capabilitiesQuery.data?.mintable === true;
  const canMint = canWriteKeys && deploymentMintable;
  const dialogScopeIds = mintableScopeIds(scopeIds, capabilityState);

  return (
    <div style={stackStyle}>
      <KeysTable
        keys={keys}
        readOnly={!canWriteKeys}
        historyVisible={canReadHistory}
        headerAction={
          <CreateKeyControl
            canWriteKeys={canWriteKeys}
            deploymentMintable={deploymentMintable}
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
        <ScopesMapper scopes={scopes} readOnly={!canWriteKeys} publicId={publicId} />
      ) : null}

      <ApiKeysDialogHost
        canMint={canMint}
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
        dialogScopeIds={dialogScopeIds}
        fullAccessAvailable={canGrantFullAccess(capabilityState)}
        onMinted={(apiKey, principal) => {
          setMinted({ apiKey, principal });
        }}
        minted={minted}
        editPayload={editPayload}
        revokeUser={revokeUser}
        policyUser={policyUser}
        scopeIds={scopeIds}
        publicId={publicId}
        readOnly={!canWriteKeys}
        onClose={() => {
          setMinted(null);
          setEditPayload(null);
          setRevokeUser(null);
          setPolicyUser(null);
        }}
      />
    </div>
  );
}
