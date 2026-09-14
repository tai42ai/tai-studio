/**
 * The CONNECT form. Given a provider, the operator supplies an alias,
 * picks which sub-services to enable, and fills the provider's config fields (a
 * `secret` field becomes a password input whose value is never echoed back as
 * text). `startConnect` either returns an OAuth `authorize_url` — handed to the
 * popup flow — or completes immediately as a no-auth connection.
 */
import {
  Button,
  Dialog,
  ErrorState,
  Field,
  FleetReport,
  Spinner,
  TextInput,
} from '@tai42/studio-sdk';
import type { ProviderView } from '@tai42/api-client';
import type { ReactNode } from 'react';

import { ConnectorRefusalNotice, Notice } from './notice';
import { useConnectDialog } from './use-connect-dialog';
import { SubServicesFieldset } from './SubServicesFieldset';

export function ConnectDialog({
  provider,
  onClose,
}: {
  provider: ProviderView;
  onClose: () => void;
}): ReactNode {
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
    fleetFailure,
    oauthNotice,
    clearNotice,
    pending,
  } = useConnectDialog(provider, onClose);

  return (
    <Dialog
      title={`Connect ${provider.display_name}`}
      description={provider.description}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
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
          <ConnectorRefusalNotice refusal={refusal} />
        ) : errorMessage !== null ? (
          <ErrorState message={errorMessage} />
        ) : null}
        {fleetFailure !== null ? <FleetReport summary={fleetFailure} /> : null}
        {oauthNotice !== null ? <Notice notice={oauthNotice} onDismiss={clearNotice} /> : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {pending ? <Spinner label="Connecting" /> : null}
            Connect
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
