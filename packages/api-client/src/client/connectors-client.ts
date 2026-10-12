/** Connector provider and connection lifecycle sub-client. */
import { encodeSegment } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

export interface StartConnectArgs {
  readonly provider_id: string;
  readonly alias: string;
  readonly enabled_sub_services: string[];
  readonly config_values?: Record<string, string>;
  readonly return_url?: string;
}

/** Look a server up by its address, or the server of an existing provider. */
export type DiscoverServerTarget = { readonly url: string } | { readonly providerId: string };

/** The body of `POST /api/connectors/providers`: add the MCP server at `url`. */
export interface AddServerArgs {
  readonly url: string;
  readonly id?: string;
  readonly display_name?: string;
  readonly description?: string;
  readonly icon_url?: string;
  readonly category?: string;
  readonly scopes?: string[];
}

/** The body of `PUT /api/connectors/providers/{id}/client`: an app registered by hand. */
export interface SetProviderClientArgs {
  readonly client_id: string;
  readonly client_secret?: string | null;
  readonly token_endpoint_auth_method?: 'client_secret_post' | 'client_secret_basic' | 'none';
  readonly issuer?: string;
}

export function connectorsClient(t: Transport) {
  const { req } = t;
  return {
    listProviders: (signal?: AbortSignal) =>
      req('/api/connectors/providers', s.providers, { signal }),
    listConnections: (signal?: AbortSignal) =>
      req('/api/connectors/connections', s.connectionsList, { signal }),
    getConnection: (id: string, signal?: AbortSignal) =>
      req(`/api/connectors/connections/${encodeSegment(id)}`, s.connectionView, { signal }),
    startConnect: (args: StartConnectArgs) =>
      req('/api/connectors/connections/start', s.startConnectResult, {
        method: 'POST',
        body: args,
      }),
    disconnect: (id: string) =>
      req(`/api/connectors/connections/${encodeSegment(id)}`, s.disconnectResult, {
        method: 'DELETE',
      }),
    reconnect: (id: string, enabled_sub_services: string[], return_url?: string) =>
      req(`/api/connectors/connections/${encodeSegment(id)}/reconnect`, s.reconnectResult, {
        method: 'POST',
        body: { enabled_sub_services, return_url },
      }),
    patchSubServices: (id: string, enabled_sub_services: string[], return_url?: string) =>
      req(
        `/api/connectors/connections/${encodeSegment(id)}/sub-services`,
        s.patchSubServicesResult,
        {
          method: 'PATCH',
          body: { enabled_sub_services, return_url },
        },
      ),
    // `iss` is the redirect's issuer parameter, sent when the redirect carried one.
    completeOAuth: (state: string, code: string, error?: string, iss?: string) =>
      req('/api/connectors/oauth/complete', s.oauthCompleteResult, {
        method: 'POST',
        body: { state, code, error, iss },
      }),
    discoverServer: (target: DiscoverServerTarget) =>
      req('/api/connectors/providers/discover', s.discoveredServer, {
        method: 'POST',
        body: 'url' in target ? { url: target.url } : { provider_id: target.providerId },
      }),
    addServer: (args: AddServerArgs) =>
      req('/api/connectors/providers', s.providerMutationResult, { method: 'POST', body: args }),
    removeProvider: (id: string) =>
      req(`/api/connectors/providers/${encodeSegment(id)}`, s.removeProviderResult, {
        method: 'DELETE',
      }),
    setProviderClient: (id: string, args: SetProviderClientArgs) =>
      req(`/api/connectors/providers/${encodeSegment(id)}/client`, s.providerMutationResult, {
        method: 'PUT',
        body: args,
      }),
  };
}
