/** Connector provider catalog and connection lifecycle schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';
import { fleetReportFanout } from './fleet';

export const subServiceView = openapi.subServiceView;

export const configFieldView = openapi.configFieldSpec;

export const providerView = openapi.providerCatalogEntry;
export type ProviderView = z.infer<typeof providerView>;

/**
 * One `connector_category` grouping row served alongside the catalog: the UI's
 * label and sort key for the providers it groups, so the list can group, order,
 * and label providers by category without a second read.
 */
export const connectorCategoryView = openapi.connectorCategoryView;
export type ConnectorCategoryView = z.infer<typeof connectorCategoryView>;

/**
 * `GET /api/connectors/providers` — the provider catalog: the providers plus the
 * category groupings the UI arranges them under.
 */
export const providers = openapi.providerCatalogResponse;
export type ProviderCatalogResponse = z.infer<typeof providers>;

/**
 * One connection. `unreachable_sub_services` names the sub-services whose MCP server did
 * not answer a live reachability probe: populated only on the single-connection GET (the
 * list projection is probe-free and always sends `[]`). Reachability is distinct from
 * `auth_health_state`: a healthy connection can still have a down sub-service.
 */
export const connectionView = openapi.connectedAccountView;
export type ConnectionView = z.infer<typeof connectionView>;

/**
 * The connections listing. `unhealthy` counts the connections whose `auth_health_state`
 * is not healthy across the whole set (independent of any filter/limit).
 */
export const connectionsList = openapi.connectionsListResponse;

// A connector mutation that writes the manifest embeds the mode-wrapped fleet `fanout` of
// the reload it broadcast; it is `null` when the response path mutated no manifest (an
// OAuth START opens a flow before any write). Hand-typed: the spec publishes the fan-out as
// an open object; the client discriminates its modes so the shared fleet-report handler
// surfaces a failed propagation on every connector flow.
export const startConnectResult = z.union([
  openapi.startConnectResponse,
  openapi.startConnectNoAuthResponse.extend({ fanout: fleetReportFanout.nullable().default(null) }),
]);

// A reconnect START opens an OAuth flow and writes no manifest, so it carries no
// fan-out (the manifest write lands when the flow completes).
export const reconnectResult = openapi.startConnectResponse;

export const disconnectResult = openapi.disconnectResponse.extend({
  fanout: fleetReportFanout.nullable().default(null),
});

export const patchSubServicesResult = openapi.patchSubServicesResponse.extend({
  // `null` on a consent-only toggle that forks an OAuth flow without a manifest write.
  fanout: fleetReportFanout.nullable().default(null),
});

export const oauthCompleteResult = z.discriminatedUnion('kind', [
  openapi.oAuthNotConfigured,
  openapi.oAuthCancelled,
  openapi.oAuthFailed,
  openapi.oAuthSuccess.extend({ fanout: fleetReportFanout }),
]);
export type OAuthCompleteResult = z.infer<typeof oauthCompleteResult>;

/**
 * `POST /api/connectors/providers/discover` — what a look-up found: the server's
 * protected resource, the sign-in services it lists, and whether a login started from
 * this deployment needs client credentials from anyone.
 */
export const discoveredServer = openapi.discoveredServerView;
export type DiscoveredServer = z.infer<typeof discoveredServer>;

/**
 * `POST /api/connectors/providers` and `PUT /api/connectors/providers/{id}/client` —
 * the provider's catalog entry after the change, and the fleet report of the manifest
 * write it made (`null` when none was made). The fan-out is hand-typed (the spec publishes it
 * as an open object) so the shared fleet-report handler can surface a failed propagation.
 */
export const providerMutationResult = openapi.providerMutationResponse.extend({
  fanout: fleetReportFanout.nullable().default(null),
});
export type ProviderMutationResult = z.infer<typeof providerMutationResult>;

/** `DELETE /api/connectors/providers/{id}` — the removed provider and its manifest write. */
export const removeProviderResult = openapi.removeProviderResponse.extend({
  fanout: fleetReportFanout.nullable().default(null),
});
export type RemoveProviderResult = z.infer<typeof removeProviderResult>;
