/**
 * The "Client credentials" dialog for a provider whose app is registered by hand. On
 * open it looks the provider's server up, so the reader sees where the secret will be
 * sent — and the redirect URI to allow — before typing it. The chosen sign-in service
 * is sent as `issuer` on every save. The ID and secret always start empty (neither is
 * ever read back); the secret lives only in this component's state, never in a query
 * key or the cache, and is gone when the dialog closes.
 */
import type { DiscoveredServer, ProviderView } from '@tai42/api-client';
import {
  CopyField,
  ErrorState,
  Field,
  FormDialog,
  Select,
  Spinner,
  TextInput,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';

import { signInChoice } from './add-server-model';
import { PROVIDERS_KEY } from './keys';

const WRAP: CSSProperties = { overflowWrap: 'anywhere', minWidth: 0 };

function RedirectUri({ lookup }: { lookup: DiscoveredServer }): ReactNode {
  if (lookup.redirect_uri !== null) {
    return (
      <CopyField
        label="Redirect URI"
        value={lookup.redirect_uri}
        caption="Allow this address in the app's redirect settings."
        idPrefix="redirect-uri"
      />
    );
  }
  return (
    <div className="tai-field">
      <span className="tai-field-label">Redirect URI</span>
      <p className="tai-muted" style={{ margin: 0 }}>
        Sign-in cannot start from this address. Ask your operator to add it to the redirect
        allow-list.
      </p>
    </div>
  );
}

function SignInService({
  lookup,
  issuer,
  onIssuer,
  showError,
  disabled,
}: {
  lookup: DiscoveredServer;
  issuer: string | null;
  onIssuer: (issuer: string) => void;
  showError: boolean;
  disabled: boolean;
}): ReactNode {
  const listed = lookup.authorization_servers;
  if (listed.length === 1) {
    return (
      <div className="tai-field">
        <span className="tai-field-label">Sign-in service</span>
        <span className="tai-mono" style={WRAP}>
          {listed[0]}
        </span>
        <p className="tai-field-hint" style={{ margin: 0 }}>
          The client secret is sent only to this service.
        </p>
      </div>
    );
  }
  return (
    <Field
      label="Sign-in service"
      error={
        showError && issuer === null ? 'Choose the sign-in service this app belongs to.' : undefined
      }
    >
      <Select
        value={issuer ?? ''}
        onValueChange={onIssuer}
        placeholder="Choose a sign-in service"
        disabled={disabled}
        options={listed.map((address) => ({ value: address, label: address }))}
      />
    </Field>
  );
}

function UnlistedIssuer({ issuer }: { issuer: string }): ReactNode {
  return (
    <div role="alert" className="tai-warn-state tai-stack tai-stack-2">
      <span>
        The sign-in service these credentials were set for is no longer listed by this server.
      </span>
      <code className="tai-mono" style={WRAP}>
        {issuer}
      </code>
    </div>
  );
}

/** The look-up of the provider's server, run once when the dialog opens. */
function useServerLookup(providerId: string, onFound: (lookup: DiscoveredServer) => void) {
  const api = useApi();
  const lookup = useMutation({
    mutationFn: () => api.discoverServer({ providerId }),
    onSuccess: onFound,
  });
  const started = useRef(false);
  const { mutate } = lookup;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);
  return lookup;
}

export function ClientCredentialsDialog({
  provider,
  onClose,
  onSaved,
}: {
  provider: ProviderView;
  onClose: () => void;
  /** The credentials were stored; the page confirms it. */
  onSaved: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [issuer, setIssuer] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [clientIdTouched, setClientIdTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const lookup = useServerLookup(provider.id, (found) => {
    setIssuer(signInChoice(found).issuer);
  });

  const found = lookup.data ?? null;
  const ready = found !== null;
  const locked = !ready || saving;
  const unlisted = found !== null ? signInChoice(found).unlisted : null;
  const missingId = clientId.trim() === '';

  const submit = async (): Promise<void> => {
    if (issuer === null) throw new Error('Choose the sign-in service this app belongs to.');
    setSaving(true);
    try {
      await api.setProviderClient(provider.id, {
        client_id: clientId.trim(),
        client_secret: secret === '' ? null : secret,
        issuer,
      });
    } finally {
      setSaving(false);
    }
    void queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY });
    onSaved();
  };

  return (
    <FormDialog
      title={`Client credentials for ${provider.display_name}`}
      description="The ID and secret of the app you registered with this server's sign-in service."
      submitLabel="Save"
      pendingLabel="Saving"
      submitDisabled={!ready || missingId || issuer === null}
      onSubmit={submit}
      onClose={onClose}
    >
      <div className="tai-stack">
        {lookup.isPending ? <Spinner label="Looking up" /> : null}
        {lookup.isError ? (
          <ErrorState
            message={lookup.error instanceof Error ? lookup.error.message : 'The look-up failed.'}
          />
        ) : null}
        {found !== null ? <RedirectUri lookup={found} /> : null}
        {unlisted !== null ? <UnlistedIssuer issuer={unlisted} /> : null}
        {found !== null ? (
          <SignInService
            lookup={found}
            issuer={issuer}
            onIssuer={setIssuer}
            showError={clientIdTouched}
            disabled={saving}
          />
        ) : null}
        <Field
          label="Client ID"
          error={clientIdTouched && missingId ? 'A client ID is required.' : undefined}
        >
          <TextInput
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
            }}
            onBlur={() => {
              setClientIdTouched(true);
            }}
            autoComplete="off"
            spellCheck={false}
            disabled={locked}
          />
        </Field>
        <Field label="Client secret" description="Leave empty for an app without a secret.">
          <TextInput
            type="password"
            autoComplete="new-password"
            value={secret}
            onChange={(event) => {
              setSecret(event.target.value);
            }}
            disabled={locked}
          />
        </Field>
      </div>
    </FormDialog>
  );
}
