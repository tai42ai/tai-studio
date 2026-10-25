/**
 * The view-model for the "Add MCP server" dialog: step 1 holds the address and its
 * look-up, step 2 holds the reviewed name, identifier and scopes and the add request.
 * Also the admin gate every provider-door control on the Connectors page shares.
 */
import {
  type AddServerArgs,
  type ApiClient,
  apiRoutes,
  type DiscoveredServer,
  type FleetReportSummary,
  isFleetReportFailure,
  type ProviderView,
  summarizeFleetFanout,
} from '@tai42/api-client';
import { useApi, useCanWrite } from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { addressError, buildAddServerArgs, identifierError, nameError } from './add-server-model';
import { CONNECTIONS_KEY, PROVIDERS_KEY } from './keys';
import { type ConnectorRefusal, readConnectorRefusal } from './notice';

type AddServerResult = Awaited<ReturnType<ApiClient['addServer']>>;

/**
 * Whether the caller may use the provider door. Its four routes are all for
 * administrators on the server, and adding a server is the concrete one among them, so
 * this one check gates every provider-door control on the page.
 */
export function useConnectorAdmin(): boolean {
  return useCanWrite(apiRoutes.post_api_connectors_providers.path, 'POST');
}

/** A request's failure split into a feature-off refusal and the server's message. */
export interface RequestFailure {
  readonly refusal: ConnectorRefusal | null;
  readonly message: string | null;
}

function failureOf(error: unknown): RequestFailure {
  const refusal = readConnectorRefusal(error);
  if (refusal !== null) return { refusal, message: null };
  return { refusal: null, message: error instanceof Error ? error.message : null };
}

function statusOf(error: unknown): unknown {
  return typeof error === 'object' && error !== null
    ? (error as { status?: unknown }).status
    : undefined;
}

/** Step 1: the address, its client-side check, and the look-up. */
function useAddressStep(onFound: (found: DiscoveredServer) => void) {
  const api = useApi();
  const [address, setAddress] = useState('');
  const [attempted, setAttempted] = useState(false);
  const lookup = useMutation({
    mutationFn: (url: string) => api.discoverServer({ url }),
    onSuccess: onFound,
  });
  const fieldError = attempted ? addressError(address) : null;
  const submit = useCallback(() => {
    setAttempted(true);
    if (addressError(address) !== null) return;
    lookup.mutate(address.trim());
  }, [address, lookup]);
  return {
    address,
    setAddress,
    fieldError,
    submit,
    pending: lookup.isPending,
    failure: lookup.isError ? failureOf(lookup.error) : null,
  };
}

/** Step 2: the reviewed fields and the add request. */
function useReviewStep(
  found: DiscoveredServer | null,
  onAdded: (provider: ProviderView, automatic: boolean) => void,
) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [scopes, setScopes] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [takenIdentifier, setTakenIdentifier] = useState<string | null>(null);
  const [fleetFailure, setFleetFailure] = useState<FleetReportSummary | null>(null);

  const add = useMutation({
    mutationFn: (args: AddServerArgs) => api.addServer(args),
    onSuccess: (result: AddServerResult) => {
      void queryClient.invalidateQueries({ queryKey: PROVIDERS_KEY });
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      const fleet = summarizeFleetFanout(result.fanout, [], result.span_release_error);
      // A reload that did not reach every worker keeps the dialog open on its report.
      if (isFleetReportFailure(fleet)) {
        setFleetFailure(fleet);
        return;
      }
      onAdded(result.provider, found?.automatic_client ?? false);
    },
    onError: (error: unknown, args: AddServerArgs) => {
      if (statusOf(error) === 409) setTakenIdentifier(args.id ?? null);
    },
  });

  const prefill = useCallback((next: DiscoveredServer) => {
    setName(next.suggested_display_name);
    setIdentifier(next.suggested_id);
    setScopes('');
    setAttempted(false);
    setTakenIdentifier(null);
    setFleetFailure(null);
  }, []);

  const submit = useCallback(() => {
    setAttempted(true);
    if (found === null || nameError(name) !== null || identifierError(identifier) !== null) return;
    add.mutate(buildAddServerArgs({ url: found.url, name, identifier, scopes }));
  }, [add, found, identifier, name, scopes]);

  const taken = takenIdentifier !== null && takenIdentifier === identifier.trim();
  const failure =
    add.isError && !taken && statusOf(add.error) !== 409 ? failureOf(add.error) : null;
  return {
    name,
    setName,
    identifier,
    setIdentifier,
    scopes,
    setScopes,
    nameFieldError: attempted ? nameError(name) : null,
    identifierFieldError: taken
      ? 'This identifier is already in use.'
      : attempted
        ? identifierError(identifier)
        : null,
    submit,
    prefill,
    reset: add.reset,
    pending: add.isPending,
    failure,
    fleetFailure,
  };
}

export function useAddServerDialog(onAdded: (provider: ProviderView, automatic: boolean) => void) {
  const [step, setStep] = useState<'address' | 'review'>('address');
  const [found, setFound] = useState<DiscoveredServer | null>(null);
  const review = useReviewStep(found, onAdded);
  const { prefill, reset } = review;
  const onFound = useCallback(
    (next: DiscoveredServer) => {
      setFound(next);
      prefill(next);
      setStep('review');
    },
    [prefill],
  );
  const address = useAddressStep(onFound);
  const backToAddress = useCallback(() => {
    reset();
    setStep('address');
  }, [reset]);
  return {
    step,
    found,
    address,
    review,
    backToAddress,
    pending: address.pending || review.pending,
  };
}
