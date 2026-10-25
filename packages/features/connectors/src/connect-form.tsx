/**
 * The CONNECT form, the connect flow's first step for a provider. The operator supplies an alias,
 * picks which sub-services to enable, and fills the provider's config fields (a
 * `secret` field becomes a password input whose value is never echoed back as
 * text). `startConnect` either returns an OAuth `authorize_url` — handed to the
 * popup flow — or completes immediately as a no-auth connection. Either way the
 * landed connection's id goes to `onConnected`.
 */
import type { ProviderView } from '@tai42/api-client';
import { Button, ErrorState, Field, Spinner, TextInput } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { ConnectorRefusalNotice, Notice } from './notice';
import { SubServicesFieldset } from './SubServicesFieldset';
import { useConnectorAdmin } from './use-add-server-dialog';
import { type OnConnected, useConnectForm } from './use-connect-form';

export function ConnectForm({
  provider,
  onConnected,
  onCancel,
  onSetClientCredentials,
}: {
  provider: ProviderView;
  onConnected: OnConnected;
  onCancel: () => void;
  /** Opens the client-credentials dialog for a server refused for lacking them. */
  onSetClientCredentials?: (provider: ProviderView) => void;
}): ReactNode {
  const isAdmin = useConnectorAdmin();
  const {
    alias,
    setAlias,
    enabled,
    configValues,
    submitted,
    aliasMissing,
    toggleSubService,
    setConfigValue,
    refusal,
    canSubmit,
    handleSubmit,
    errorMessage,
    oauthNotice,
    clearNotice,
    pending,
  } = useConnectForm(provider, onConnected);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      {provider.description !== '' ? (
        <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>{provider.description}</p>
      ) : null}
      <Field
        label="Alias"
        description="A name to tell this connection apart from others."
        error={submitted && aliasMissing ? 'An alias is required.' : undefined}
      >
        <TextInput
          value={alias}
          onChange={(event) => {
            setAlias(event.target.value);
          }}
          placeholder="e.g. work-account"
        />
      </Field>

      <SubServicesFieldset
        subServices={provider.sub_services}
        enabled={enabled}
        onToggle={toggleSubService}
      />

      {provider.config_fields.map((field) => (
        <Field
          key={field.key}
          label={field.required ? `${field.label} *` : field.label}
          error={
            submitted && field.required && (configValues[field.key] ?? '').trim() === ''
              ? `${field.label} is required.`
              : undefined
          }
        >
          <TextInput
            type={field.secret ? 'password' : 'text'}
            autoComplete={field.secret ? 'new-password' : 'off'}
            value={configValues[field.key] ?? ''}
            onChange={(event) => {
              setConfigValue(field.key, event.target.value);
            }}
          />
        </Field>
      ))}

      {refusal !== null ? (
        <ConnectorRefusalNotice
          refusal={refusal}
          action={
            refusal.kind === 'client-required' && isAdmin && onSetClientCredentials ? (
              <Button
                onClick={() => {
                  onSetClientCredentials(provider);
                }}
              >
                Set client credentials
              </Button>
            ) : undefined
          }
        />
      ) : errorMessage !== null ? (
        <ErrorState message={errorMessage} />
      ) : null}
      {oauthNotice !== null ? <Notice notice={oauthNotice} onDismiss={clearNotice} /> : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {pending ? <Spinner label="Connecting" /> : null}
          Connect
        </Button>
      </div>
    </div>
  );
}
