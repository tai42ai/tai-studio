/**
 * The "Add MCP server" dialog: one `Dialog` in two steps. Step 1 takes the server's
 * address and looks it up; step 2 reviews what the look-up found (where it signs in,
 * whether it registers apps by itself), takes the name, identifier and scopes, and
 * adds the server. Escape closes it unless a request is in flight. Every server
 * refusal is shown with the server's own message, as text.
 */
import type { DiscoveredServer, ProviderView } from '@tai42/api-client';
import {
  Badge,
  Button,
  Dialog,
  Field,
  FleetReport,
  ScrollRegion,
  Spinner,
  TextInput,
  XCircleIcon,
} from '@tai42/studio-sdk';
import { type CSSProperties, type ReactNode, useEffect, useId, useRef } from 'react';

import { issuerHost } from './add-server-model';
import { ConnectorRefusalNotice } from './notice';
import { type RequestFailure, useAddServerDialog } from './use-add-server-dialog';

type DialogModel = ReturnType<typeof useAddServerDialog>;

const WRAP: CSSProperties = { overflowWrap: 'anywhere', minWidth: 0 };

const SUMMARY: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)',
  columnGap: 'var(--tai-space-4)',
  rowGap: 'var(--tai-space-3)',
  margin: 0,
};

/** A refused request: the feature-off note, or the server's message under a headline. */
function RequestRefusal({ failure }: { failure: RequestFailure | null }): ReactNode {
  if (failure === null) return null;
  if (failure.refusal !== null) return <ConnectorRefusalNotice refusal={failure.refusal} />;
  if (failure.message === null) return null;
  return (
    <div role="alert" className="tai-error-state tai-stack tai-stack-2">
      <strong className="tai-error-state-title">
        <XCircleIcon />
        The server could not be added
      </strong>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{failure.message}</p>
    </div>
  );
}

function AddressStep({ vm, onClose }: { vm: DialogModel; onClose: () => void }): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);
  const { address } = vm;
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <form
      className="tai-stack"
      onSubmit={(event) => {
        event.preventDefault();
        address.submit();
      }}
    >
      <Field
        label="Server address"
        description="The URL of an MCP server that signs in with OAuth."
        error={address.fieldError ?? undefined}
      >
        <TextInput
          ref={inputRef}
          value={address.address}
          onChange={(event) => {
            address.setAddress(event.target.value);
          }}
          placeholder="https://mcp.example.com/mcp"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          disabled={vm.pending}
        />
      </Field>
      <RequestRefusal failure={address.failure} />
      <div className="tai-dialog-actions">
        <Button type="button" onClick={onClose} disabled={vm.pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={vm.pending}>
          {address.pending ? <Spinner label="Looking up" /> : null}
          Look up
        </Button>
      </div>
    </form>
  );
}

function Summary({
  found,
  onChange,
}: {
  found: DiscoveredServer;
  onChange: () => void;
}): ReactNode {
  return (
    <dl style={SUMMARY}>
      <dt className="tai-muted">Address</dt>
      <dd style={{ margin: 0, ...WRAP }}>
        <span style={WRAP}>{found.url}</span>{' '}
        <Button type="button" variant="ghost" onClick={onChange}>
          Change
        </Button>
      </dd>
      <dt className="tai-muted">Signs in at</dt>
      <dd style={{ margin: 0, ...WRAP }}>{issuerHost(found.issuer)}</dd>
      <dt className="tai-muted">App registration</dt>
      <dd style={{ margin: 0 }} className="tai-stack tai-stack-2">
        {found.automatic_client ? (
          <span>
            <Badge variant="success">Automatic</Badge>
          </span>
        ) : (
          <>
            <span>
              <Badge variant="warning">Needs client credentials</Badge>
            </span>
            <span>
              This server does not register apps by itself. After you add it, set its client ID and
              secret.
            </span>
          </>
        )}
      </dd>
    </dl>
  );
}

function ReviewFields({ vm, found }: { vm: DialogModel; found: DiscoveredServer }): ReactNode {
  const nameRef = useRef<HTMLInputElement>(null);
  const listedId = useId();
  const { review } = vm;
  useEffect(() => {
    nameRef.current?.focus();
  }, []);
  const listed = found.scopes_supported;
  return (
    <>
      <Field label="Name" error={review.nameFieldError ?? undefined}>
        <TextInput
          ref={nameRef}
          value={review.name}
          onChange={(event) => {
            review.setName(event.target.value);
          }}
          disabled={vm.pending}
        />
      </Field>
      <Field
        label="Identifier"
        description="Used in tool names. Lowercase letters, digits and underscores, starting with a letter."
        error={review.identifierFieldError ?? undefined}
      >
        <TextInput
          value={review.identifier}
          onChange={(event) => {
            review.setIdentifier(event.target.value);
          }}
          autoComplete="off"
          spellCheck={false}
          disabled={vm.pending}
        />
      </Field>
      <Field label="Scopes" description="Leave empty to request what the server lists.">
        <TextInput
          value={review.scopes}
          onChange={(event) => {
            review.setScopes(event.target.value);
          }}
          aria-describedby={listed.length > 0 ? listedId : undefined}
          autoComplete="off"
          spellCheck={false}
          disabled={vm.pending}
        />
      </Field>
      {listed.length > 0 ? (
        <p id={listedId} className="tai-field-hint" style={{ margin: 0, ...WRAP }}>
          The server lists: <code className="tai-mono">{listed.join(', ')}</code>
        </p>
      ) : null}
    </>
  );
}

function ReviewStep({ vm, found }: { vm: DialogModel; found: DiscoveredServer }): ReactNode {
  const { review } = vm;
  return (
    <form
      className="tai-stack"
      onSubmit={(event) => {
        event.preventDefault();
        review.submit();
      }}
    >
      <ScrollRegion
        label="Server details"
        axis="vertical"
        style={{ maxHeight: 'calc(100dvh - 16rem)', overflowY: 'auto' }}
      >
        <div className="tai-stack">
          <Summary found={found} onChange={vm.backToAddress} />
          <ReviewFields vm={vm} found={found} />
        </div>
      </ScrollRegion>
      <RequestRefusal failure={review.failure} />
      {review.fleetFailure !== null ? <FleetReport summary={review.fleetFailure} /> : null}
      <div className="tai-dialog-actions">
        <Button type="button" onClick={vm.backToAddress} disabled={vm.pending}>
          Back
        </Button>
        <Button type="submit" variant="primary" disabled={vm.pending}>
          {review.pending ? <Spinner label="Adding" /> : null}
          Add server
        </Button>
      </div>
    </form>
  );
}

export function AddServerDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  /** The server was added and every worker reloaded; `automatic` when it registers apps by itself. */
  onAdded: (provider: ProviderView, automatic: boolean) => void;
}): ReactNode {
  const vm = useAddServerDialog(onAdded);
  return (
    <Dialog
      title="Add MCP server"
      open
      dismissable={!vm.pending}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {vm.step === 'review' && vm.found !== null ? (
        <ReviewStep vm={vm} found={vm.found} />
      ) : (
        <AddressStep vm={vm} onClose={onClose} />
      )}
    </Dialog>
  );
}
