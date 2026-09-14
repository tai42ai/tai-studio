/** Connector provider and connection lifecycle sub-client. */
import * as s from '../schemas';
import { encodeSegment } from '../http';
import type { Transport } from './transport';

export interface StartConnectArgs {
  readonly provider_id: string;
  readonly alias: string;
  readonly enabled_sub_services: string[];
  readonly config_values?: Record<string, string>;
  readonly return_url?: string;
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
    completeOAuth: (state: string, code: string, error?: string) =>
      req('/api/connectors/oauth/complete', s.oauthCompleteResult, {
        method: 'POST',
        body: { state, code, error },
      }),
  };
}
