/**
 * The view-model for the connect form: the field state, the sub-service toggles,
 * the start-connect mutation (OAuth popup vs no-auth completion), and the derived
 * submit gate / error surfaces.
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@tai42/studio-sdk';
import {
  summarizeFleetFanout,
  type ApiClient,
  type FleetReportSummary,
  type ProviderView,
  type StartConnectArgs,
} from '@tai42/api-client';

import { CONNECTIONS_KEY } from './keys';
import { readConnectorRefusal } from './notice';
import { useOAuthPopup } from './oauth';
import { buildConnectArgs, hasAuthorizeUrl } from './connect-dialog-model';

type StartConnectResult = Awaited<ReturnType<ApiClient['startConnect']>>;

export function useConnectDialog(provider: ProviderView, onClose: () => void) {
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

  // Both completion paths (no-auth add and OAuth popup) settle the same way: a
  // non-converged broadcast keeps the dialog mounted with the honest report; a
  // converged (or lone-worker) completion closes it.
  const settleFleet = useCallback(
    (summary: FleetReportSummary | null) => {
      if (summary !== null && summary.status !== 'converged') {
        setFleetFailure(summary);
        return;
      }
      onClose();
    },
    [onClose],
  );

  const oauth = useOAuthPopup({ onSuccess: settleFleet });

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
      settleFleet(summarizeFleetFanout(result.fanout));
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

  // The connector START refused with a named 501: the token store is off
  // (`connectors-not-configured`), or this provider's OAuth credentials are unset
  // (`connector-provider-not-configured`). Either way no connect can land until an
  // operator acts. OFF is a state, not an error — show the muted, named-actionable
  // note and withdraw the submit affordance rather than a loud red alert.
  const refusal = readConnectorRefusal(connect.error);

  // Disabled while a request is in flight, and once a refusal reveals the write is
  // certain to refuse (it is not offered). Validation is surfaced loudly on submit (as
  // field errors) rather than by silently blocking the button.
  const canSubmit = !connect.isPending && !oauth.pending && refusal === null;

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
    if (aliasMissing || missingRequired.length > 0) return;
    connect.mutate(buildConnectArgs(provider, alias, enabled, configValues));
  }, [aliasMissing, missingRequired.length, provider, configValues, connect, alias, enabled]);

  // A named refusal is rendered as the muted OFF note below, never here — so the red
  // ErrorState is reserved for genuine errors (validation, upstream, 5xx).
  const errorMessage =
    refusal === null && connect.error instanceof Error ? connect.error.message : null;

  return {
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
    oauthNotice: oauth.notice,
    clearNotice: oauth.clearNotice,
    pending: connect.isPending || oauth.pending,
  };
}
