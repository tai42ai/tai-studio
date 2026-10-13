/** Connector provider and connection lifecycle sub-client. */
import { apiRoutes, buildPath } from '../generated/api-routes';
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
      req(apiRoutes.get_api_connectors_providers.path, s.providers, { signal }),
    listConnections: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_connectors_connections.path, s.connectionsList, { signal }),
    getConnection: (id: string, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.get_api_connectors_connections_connection_id.path, {
          connection_id: id,
        }),
        s.connectionView,
        { signal },
      ),
    startConnect: (args: StartConnectArgs) =>
      req(apiRoutes.post_api_connectors_connections_start.path, s.startConnectResult, {
        method: 'POST',
        body: args,
      }),
    disconnect: (id: string) =>
      req(
        buildPath(apiRoutes.delete_api_connectors_connections_connection_id.path, {
          connection_id: id,
        }),
        s.disconnectResult,
        {
          method: 'DELETE',
        },
      ),
    reconnect: (id: string, enabled_sub_services: string[], return_url?: string) =>
      req(
        buildPath(apiRoutes.post_api_connectors_connections_connection_id_reconnect.path, {
          connection_id: id,
        }),
        s.reconnectResult,
        {
          method: 'POST',
          body: { enabled_sub_services, return_url },
        },
      ),
    patchSubServices: (id: string, enabled_sub_services: string[], return_url?: string) =>
      req(
        buildPath(apiRoutes.patch_api_connectors_connections_connection_id_sub_services.path, {
          connection_id: id,
        }),
        s.patchSubServicesResult,
        {
          method: 'PATCH',
          body: { enabled_sub_services, return_url },
        },
      ),
    // `iss` is the redirect's issuer parameter, sent when the redirect carried one.
    completeOAuth: (state: string, code: string, error?: string, iss?: string) =>
      req(apiRoutes.post_api_connectors_oauth_complete.path, s.oauthCompleteResult, {
        method: 'POST',
        body: { state, code, error, iss },
      }),
    ...providerSetupClient(t),
  };
}

/** The provider-setup calls: look a server up, add it, set its sign-in client, remove it. */
function providerSetupClient(t: Transport) {
  const { req } = t;
  return {
    discoverServer: (target: DiscoverServerTarget) =>
      req(apiRoutes.post_api_connectors_providers_discover.path, s.discoveredServer, {
        method: 'POST',
        body: 'url' in target ? { url: target.url } : { provider_id: target.providerId },
      }),
    addServer: (args: AddServerArgs) =>
      req(apiRoutes.post_api_connectors_providers.path, s.providerMutationResult, {
        method: 'POST',
        body: args,
      }),
    removeProvider: (id: string) =>
      req(
        buildPath(apiRoutes.delete_api_connectors_providers_provider_id.path, { provider_id: id }),
        s.removeProviderResult,
        { method: 'DELETE' },
      ),
    setProviderClient: (id: string, args: SetProviderClientArgs) =>
      req(
        buildPath(apiRoutes.put_api_connectors_providers_provider_id_client.path, {
          provider_id: id,
        }),
        s.providerMutationResult,
        { method: 'PUT', body: args },
      ),
  };
}
