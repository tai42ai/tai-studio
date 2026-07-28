/**
 * The API keys tab: provisions and manages the deployment's API keys and the
 * scope → URL map the policy enforcer reads.
 *
 * Keys: a table of every key's payload (user_id, description, scopes) from
 * `listTokensPayload` — key MATERIAL is never returned by the server, so it is
 * never shown here. Creating a key returns the raw `sk-…` string ONCE; it is
 * shown in a copy box with a warning and is never stored client-side beyond
 * that dialog's lifetime. Editing changes description + scopes; revoking
 * deletes the key after a confirm.
 *
 * Access control: the scope ↔ URL map is managed by the `ScopesMapper` — a
 * drag-drop surface that maps routes onto scopes, surfaces unmapped routes and
 * sub-MCP mounts in an Unassigned bucket, and pins routes public. It mounts admin
 * reads (the route table, the public-route pins, the sub-MCP mounts), so it is shown
 * only to a caller whose projection reaches every one of them (a full projection, or
 * a scope covering all three) — a scoped own-key caller sees only the keys table
 * above, never a 403-walled mapper on this always-reachable tab.
 *
 * Every server-supplied string (user_id, description, scope, URL, error text)
 * renders as ESCAPED text through the design-system components — never an HTML
 * sink. Failures surface loudly through <ErrorState>. Read-only config mode
 * disables every mutation.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ScrollRegion,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tooltip,
  coversAnyRoute,
  errorMessage,
  isFullProjection,
  useApi,
  useCanWrite,
  useCapabilities,
  type CapabilityState,
} from '@tai42/studio-sdk';

import { authCapabilitiesKey, scopesKey, tokensPayloadKey } from './keys';
import { PolicyVersionsDialog } from './PolicyVersionsDialog';
import { ScopesMapper } from './ScopesMapper';
import { badgeRowStyle, ownerOf, type KeyPayload } from './api-keys-common';
import { CreateKeyDialog } from './CreateKeyDialog';
import { MintedKeyDialog } from './MintedKeyDialog';
import { EditKeyDialog } from './EditKeyDialog';
import { RevokeKeyDialog } from './RevokeKeyDialog';

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  marginBottom: 'var(--tai-space-4)',
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-lg)',
  color: 'var(--tai-color-text)',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
  justifyContent: 'flex-end',
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

// Distinguishes an API key (a delegated credential) from an account (the managed human
// login that holds a role), so the User ID / Owner columns read unambiguously.
const descriptionStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-4)',
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
  maxWidth: '52rem',
};

const headingRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
};

const infoTriggerStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.25rem',
  height: '1.25rem',
  padding: 0,
  // The trigger's ground is transparent, so this edge is its ONLY boundary and
  // takes the contrast-safe control token rather than the decorative one.
  border: '1px solid var(--tai-color-control-border)',
  borderRadius: 'var(--tai-radius-full)',
  background: 'transparent',
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
  cursor: 'help',
};

/** Unique scope ids across the scope map, excluding the implicit `public` scope. */
function scopeIdsOf(scopes: Record<string, string>): string[] {
  return [...new Set(Object.values(scopes))].filter((id) => id !== 'public').sort();
}

/** The mint route the caller's projection must be able to reach to create a key. */
const MINT_ROUTE = '/api/auth/api-keys';

/**
 * The admin reads {@link ScopesMapper} issues on mount: the route table
 * (`/api/auth/routes`), the public-route pins (`/api/auth/public-routes`), and the
 * sub-MCP mounts (`/api/sub-mcp`). A caller that cannot reach EVERY one of them would
 * 403-wall the card, so the mapper renders only when the projection covers them all.
 * (The two `/api/auth` reads exclude a seeded editor/viewer, whose fence carves in
 * only the self-service `/api/auth` surface; the top-level `/api/sub-mcp` read excludes
 * an owned-key session whose fence covers `/api/auth` but not `/api/sub-mcp`.)
 */
const SCOPES_MAPPER_READ_ROUTES = [
  '/api/auth/routes',
  '/api/auth/public-routes',
  '/api/sub-mcp',
] as const;

/**
 * Whether the deployment-wide access-control mapper is shown to this caller — the
 * visibility half of the projection ⊆ gate for an embedded admin sub-card. A full
 * (admin / gate-off) projection always shows it; a scoped session shows it only when
 * its projection reaches every read the mapper mounts, so a caller who cannot reach
 * those admin routes simply sees the own-key keys table and never a 403-walled card.
 * Fails closed while the projection is not ready.
 */
function scopesMapperVisible(state: CapabilityState): boolean {
  if (state.status !== 'ready') return false;
  const { projection } = state;
  return (
    isFullProjection(projection) ||
    SCOPES_MAPPER_READ_ROUTES.every((route) => coversAnyRoute(projection, [route]))
  );
}

/**
 * Whether the caller's projection permits minting a key — the client half of the
 * projection ⊆ gate invariant, catching two DIFFERENT server deny mechanisms the
 * deployment `mintable` flag does not. `canMintRoute` is {@link useCanWrite} for the
 * mint POST: `true` for a full (admin / gate-off) projection or a scoped one that
 * reaches the route, and `false` until the projection is ready (fail closed — the
 * control is hidden until the gate is known). A full projection always mints; a scoped
 * session mints only when the route is reached AND the key is NOT owned (owned keys 403
 * on mint via a per-request handler rule invisible to the route table).
 */
function projectionCanMint(state: CapabilityState, canMintRoute: boolean): boolean {
  if (!canMintRoute) return false;
  // `canMintRoute` implies `ready`; this narrows the state for the owner check below.
  if (state.status !== 'ready') return false;
  const { projection } = state;
  if (isFullProjection(projection)) return true;
  return projection.owner_user_id === null;
}

/**
 * The scope options the create dialog offers. A scoped session is capped to the
 * scopes its projection carries — offering scopes the server would 400 on is the
 * same wall-of-errors the mint gating avoids; a full (or not-yet-ready) projection
 * keeps the whole scope map.
 *
 * A `"*"` in `projection.scopes` is the universal wildcard ("everything", `"*" ∩ X
 * = X` server-side — access_control/backend.py), NOT a concrete scope id, so it
 * expands to the WHOLE scope map rather than intersecting to nothing. Only a list
 * of concrete ids caps the options to those ids.
 */
function mintableScopeIds(scopeIds: readonly string[], state: CapabilityState): string[] {
  if (state.status !== 'ready' || isFullProjection(state.projection)) return [...scopeIds];
  const { scopes } = state.projection;
  if (scopes.includes('*')) return [...scopeIds];
  const allowed = new Set(scopes);
  return scopeIds.filter((id) => allowed.has(id));
}

// -- main --------------------------------------------------------------------

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
  // Whether this deployment can MINT keys locally. On a validator-only
  // deployment (`mintable: false`) the create control disables up front with a
  // note, instead of surfacing a raw mint failure AFTER the user fills the form.
  // This gates only the create path, so it is fetched only when that path can
  // render: a read-only viewer never consumes it, and disabling the query keeps
  // a failing capabilities endpoint from blocking the key list they can still
  // view.
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

  // The capabilities query is disabled (and thus perpetually pending, never
  // failed) in readOnly mode, so only fold it into the whole-tab gates for the
  // mint path.
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
  // unused (and absent) in readOnly mode, where the create control is hidden.
  const deploymentMintable = !readOnly && capabilitiesQuery.data?.mintable === true;
  // The caller must ALSO be projection-permitted: a non-mintable deployment shows
  // the external-issuer note, a mintable deployment the caller cannot mint on shows
  // a short access note, and only when both hold does the create control render.
  const projectionMintable = projectionCanMint(capabilityState, canMintRoute);
  const canMint = deploymentMintable && projectionMintable;
  const dialogScopeIds = mintableScopeIds(scopeIds, capabilityState);

  return (
    <div style={stackStyle}>
      <Card>
        <div style={cardHeaderStyle}>
          <div style={headingRowStyle}>
            <h3 style={headingStyle}>API keys</h3>
            {/* Claim links are minted alongside a key, never from an existing row —
                a per-row claim action is impossible by design, so this explains it. */}
            <Tooltip content="Claim links are created when a key is minted, not from existing keys.">
              <button type="button" aria-label="About claim links" style={infoTriggerStyle}>
                ?
              </button>
            </Tooltip>
          </div>
          {readOnly ? null : !deploymentMintable ? (
            <div style={createGateStyle}>
              <Button type="button" variant="primary" disabled>
                Create key
              </Button>
              <span style={createNoteStyle}>Keys are managed at the external issuer</span>
            </div>
          ) : projectionMintable ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setCreateOpen(true);
              }}
            >
              Create key
            </Button>
          ) : (
            <span style={createNoteStyle}>Your access does not permit minting keys.</span>
          )}
        </div>

        <p style={descriptionStyle}>
          An API key is a scoped credential a user creates to delegate a slice of their own access —
          it is not an account. An account is the human login an admin manages, and it carries a
          role. Below, <strong>User ID</strong> is the account a key acts as, and{' '}
          <strong>Owner</strong> is the account that created the key.
        </p>

        {keys.length === 0 ? (
          <EmptyState title="No API keys" description="Create a key to provision access." />
        ) : (
          <ScrollRegion label="API keys">
            <Table>
              <THead>
                <TR>
                  <TH>User ID</TH>
                  {/* The owner claim the server merges into `policy_data`; an admin
                      view distinguishes owned (delegated) keys from ownerless ones. */}
                  <TH>Owner</TH>
                  <TH>Description</TH>
                  <TH>Scopes</TH>
                  {/* History is a read surface, available in readOnly too, so the
                      Actions column always renders. */}
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {keys.map((payload) => (
                  <TR key={payload.user_id}>
                    <TD className="tai-mono">{payload.user_id}</TD>
                    <TD className="tai-mono">{ownerOf(payload) ?? '—'}</TD>
                    <TD>{payload.description}</TD>
                    <TD>
                      <div style={badgeRowStyle}>
                        {payload.scopes.map((scope) => (
                          <Badge key={scope} variant="neutral">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD>
                      <div style={actionsStyle}>
                        {readOnly ? null : (
                          <Button
                            type="button"
                            aria-label={`Edit key ${payload.user_id}`}
                            onClick={() => {
                              setEditPayload(payload);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {/* History stays reachable in readOnly — only its Rollback
                            action is hidden, inside the dialog. */}
                        <Button
                          type="button"
                          aria-label={`Policy history for ${payload.user_id}`}
                          onClick={() => {
                            setPolicyUser(payload.user_id);
                          }}
                        >
                          History
                        </Button>
                        {readOnly ? null : (
                          <Button
                            type="button"
                            variant="danger"
                            aria-label={`Revoke key ${payload.user_id}`}
                            onClick={() => {
                              setRevokeUser(payload.user_id);
                            }}
                          >
                            Revoke
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </ScrollRegion>
        )}
      </Card>

      {scopesMapperVisible(capabilityState) ? (
        <ScopesMapper scopes={scopes} readOnly={readOnly} />
      ) : null}

      {canMint ? (
        <CreateKeyDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          scopeIds={dialogScopeIds}
          onMinted={setMintedKey}
        />
      ) : null}
      {mintedKey !== null ? (
        <MintedKeyDialog
          apiKey={mintedKey}
          onClose={() => {
            setMintedKey(null);
          }}
        />
      ) : null}
      {editPayload !== null ? (
        <EditKeyDialog
          key={editPayload.user_id}
          payload={editPayload}
          scopeIds={scopeIds}
          onClose={() => {
            setEditPayload(null);
          }}
        />
      ) : null}
      {revokeUser !== null ? (
        <RevokeKeyDialog
          userId={revokeUser}
          onClose={() => {
            setRevokeUser(null);
          }}
        />
      ) : null}
      {policyUser !== null ? (
        <PolicyVersionsDialog
          userId={policyUser}
          readOnly={readOnly}
          onClose={() => {
            setPolicyUser(null);
          }}
        />
      ) : null}
    </div>
  );
}
