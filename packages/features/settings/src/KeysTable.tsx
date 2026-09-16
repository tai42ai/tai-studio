/**
 * The API-keys card: the heading (with the claim-links tooltip and a caller-supplied
 * create control), the account/key explainer, and the table of every key's payload
 * with per-row Edit / History / Revoke actions. Key MATERIAL is never returned by the
 * server, so it never appears here.
 */
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ScrollRegion,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Tooltip,
  TR,
} from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import { badgeRowStyle } from './api-keys-styles';
import type { KeyPayload } from './key-owner';

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

// Distinguishes an API key (a delegated credential) from an account (the managed human
// login that holds a role), so the User ID / Principal columns read unambiguously.
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

const principalCellStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
};

/**
 * A key row's owning principal: a kind Badge beside the display name, the `user_id`
 * carried on the cell's `title`. A key whose principal row is absent shows a dash and,
 * when the row is flagged `orphaned`, a danger Badge — the restore state where a backup
 * left a key without its principal.
 */
function PrincipalCell({ payload }: { readonly payload: KeyPayload }): ReactNode {
  const { principal } = payload;
  if (principal != null) {
    return (
      <span style={principalCellStyle} title={principal.user_id}>
        <Badge variant="neutral">{principal.kind}</Badge>
        {principal.display_name}
      </span>
    );
  }
  return (
    <span style={principalCellStyle} title="No principal (orphaned key — re-import the backup)">
      —{payload.orphaned === true ? <Badge variant="danger">orphaned</Badge> : null}
    </span>
  );
}

/** One key row's Edit / History / Revoke actions — History stays reachable in readOnly. */
function KeyRowActions({
  payload,
  readOnly,
  onEdit,
  onHistory,
  onRevoke,
}: {
  readonly payload: KeyPayload;
  readonly readOnly: boolean;
  readonly onEdit: (payload: KeyPayload) => void;
  readonly onHistory: (userId: string) => void;
  readonly onRevoke: (userId: string) => void;
}): ReactNode {
  return (
    <div style={actionsStyle}>
      {readOnly ? null : (
        <Button
          type="button"
          aria-label={`Edit key ${payload.user_id}`}
          onClick={() => {
            onEdit(payload);
          }}
        >
          Edit
        </Button>
      )}
      {/* History stays reachable in readOnly — only its Rollback action is hidden. */}
      <Button
        type="button"
        aria-label={`Policy history for ${payload.user_id}`}
        onClick={() => {
          onHistory(payload.user_id);
        }}
      >
        History
      </Button>
      {readOnly ? null : (
        <Button
          type="button"
          variant="ghost"
          aria-label={`Revoke key ${payload.user_id}`}
          onClick={() => {
            onRevoke(payload.user_id);
          }}
        >
          Revoke
        </Button>
      )}
    </div>
  );
}

export function KeysTable({
  keys,
  readOnly,
  headerAction,
  onEdit,
  onHistory,
  onRevoke,
}: {
  readonly keys: readonly KeyPayload[];
  readonly readOnly: boolean;
  readonly headerAction: ReactNode;
  readonly onEdit: (payload: KeyPayload) => void;
  readonly onHistory: (userId: string) => void;
  readonly onRevoke: (userId: string) => void;
}): ReactNode {
  return (
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
        {headerAction}
      </div>

      <p style={descriptionStyle}>
        An API key is a scoped credential a user creates to delegate a slice of their own access —
        it is not an account. An account is the human login an admin manages, and it carries a role.
        Below, <strong>User ID</strong> is the account a key acts as, and <strong>Principal</strong>{' '}
        is the identity that owns the key.
      </p>

      {keys.length === 0 ? (
        <EmptyState title="No API keys" description="Create a key to provision access." />
      ) : (
        <ScrollRegion label="API keys">
          <Table>
            <THead>
              <TR>
                <TH>User ID</TH>
                {/* The key's owning principal, resolved server-side to kind + display name. */}
                <TH>Principal</TH>
                <TH>Description</TH>
                <TH>Scopes</TH>
                {/* History is a read surface, available in readOnly too. */}
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {keys.map((payload) => (
                <TR key={payload.user_id}>
                  <TD className="tai-mono">{payload.user_id}</TD>
                  <TD>
                    <PrincipalCell payload={payload} />
                  </TD>
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
                    <KeyRowActions
                      payload={payload}
                      readOnly={readOnly}
                      onEdit={onEdit}
                      onHistory={onHistory}
                      onRevoke={onRevoke}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </ScrollRegion>
      )}
    </Card>
  );
}
