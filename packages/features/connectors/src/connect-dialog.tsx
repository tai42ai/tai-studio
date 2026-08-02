/**
 * The CONNECT form. Given a provider, the operator supplies an alias,
 * picks which sub-services to enable, and fills the provider's config fields (a
 * `secret` field becomes a password input whose value is never echoed back as
 * text). `startConnect` either returns an OAuth `authorize_url` — handed to the
 * popup flow — or completes immediately as a no-auth connection.
 */
import {
  Button,
  Checkbox,
  Dialog,
  ErrorState,
  FeatureDisabled,
  Field,
  FleetReport,
  Spinner,
  TextInput,
  isFeatureDisabled,
  useApi,
} from '@tai42/studio-sdk';
import {
  summarizeFleetFanout,
  type ApiClient,
  type FleetReportSummary,
  type ProviderView,
  type StartConnectArgs,
} from '@tai42/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { CONNECTIONS_KEY } from './keys';
import { Notice } from './notice';
import { useOAuthPopup } from './oauth';

type StartConnectResult = Awaited<ReturnType<ApiClient['startConnect']>>;

function hasAuthorizeUrl(
  result: StartConnectResult,
): result is Extract<StartConnectResult, { authorize_url: string }> {
  return 'authorize_url' in result;
}

export function ConnectDialog({
  provider,
  onClose,
}: {
  provider: ProviderView;
  onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const [alias, setAlias] = useState('');
  const [enabled, setEnabled] = useState<ReadonlySet<string>>(
    () => new Set(provider.sub_services.map((service) => service.id)),
  );
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  // A connect that landed but whose fleet broadcast did NOT converge keeps the dialog
  // open showing the honest report, rather than closing on a silent partial failure.
  // Set by both the no-auth completion and the OAuth popup completion.
  const [fleetFailure, setFleetFailure] = useState<FleetReportSummary | null>(null);

  // The OAuth completion hands back its settled fleet summary: a non-converged
  // broadcast keeps the dialog mounted rendering the honest report; a converged (or
  // lone-worker) completion closes the dialog.
  const oauth = useOAuthPopup({
    onSuccess: (fleet) => {
      if (fleet !== null && fleet.status !== 'converged') {
        setFleetFailure(fleet);
        return;
      }
      onClose();
    },
  });

  const missingRequired = useMemo(
    () =>
      provider.config_fields
        .filter((field) => field.required)
        .filter((field) => (configValues[field.key] ?? '').trim() === '')
        .map((field) => field.key),
    [provider.config_fields, configValues],
  );
  const aliasMissing = alias.trim() === '';

  const connect = useMutation({
    mutationFn: (args: StartConnectArgs) => api.startConnect(args),
    onSuccess: (result: StartConnectResult) => {
      if (hasAuthorizeUrl(result)) {
        oauth.start(result.authorize_url);
        return;
      }
      // No-auth provider: the connection is already created and its manifest entry
      // broadcast to the fleet.
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      const summary = summarizeFleetFanout(result.fanout);
      // A failed propagation keeps the dialog open with the honest fleet report; a
      // converged (or lone-worker) add closes the dialog.
      if (summary !== null && summary.status !== 'converged') {
        setFleetFailure(summary);
        return;
      }
      onClose();
    },
  });

  const toggleSubService = useCallback((id: string, checked: boolean) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const setConfigValue = useCallback((key: string, value: string) => {
    setConfigValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  // The connector START refused with a 501 `connectors-not-configured`: the token
  // store is off, so no connect can ever land. OFF is a state, not an error — show
  // the muted note and withdraw the submit affordance rather than a loud red alert.
  const connectorsDisabled = isFeatureDisabled(connect.error);

  // Disabled while a request is in flight, and once the store reveals itself off (a
  // certain-to-refuse write is not offered). Validation is surfaced loudly on submit
  // (as field errors) rather than by silently blocking the button.
  const canSubmit = !connect.isPending && !oauth.pending && !connectorsDisabled;

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    if (aliasMissing || missingRequired.length > 0) return;
    const values: Record<string, string> = {};
    for (const field of provider.config_fields) {
      const value = configValues[field.key];
      if (value !== undefined && value !== '') values[field.key] = value;
    }
    connect.mutate({
      provider_id: provider.id,
      alias: alias.trim(),
      enabled_sub_services: [...enabled],
      ...(Object.keys(values).length > 0 ? { config_values: values } : {}),
    });
  }, [
    aliasMissing,
    missingRequired.length,
    provider.config_fields,
    provider.id,
    configValues,
    connect,
    alias,
    enabled,
  ]);

  // A store-off refusal is rendered as the muted OFF note below, never here — so the
  // red ErrorState is reserved for genuine errors (validation, upstream, 5xx).
  const errorMessage =
    !connectorsDisabled && connect.error instanceof Error ? connect.error.message : null;

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

        {provider.sub_services.length > 0 ? (
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>
              Sub-services
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
              {provider.sub_services.map((service) => (
                <Checkbox
                  key={service.id}
                  label={service.display_name}
                  checked={enabled.has(service.id)}
                  onCheckedChange={(checked) => {
                    toggleSubService(service.id, checked);
                  }}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

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

        {connectorsDisabled ? (
          <FeatureDisabled feature="Connectors" envVar="CONNECTOR_STORE_PG_PASSWORD" />
        ) : errorMessage !== null ? (
          <ErrorState message={errorMessage} />
        ) : null}
        {fleetFailure !== null ? <FleetReport summary={fleetFailure} /> : null}
        {oauth.notice !== null ? (
          <Notice notice={oauth.notice} onDismiss={oauth.clearNotice} />
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            {connect.isPending || oauth.pending ? <Spinner label="Connecting" /> : null}
            Connect
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
