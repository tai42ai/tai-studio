/** Caller capability projection and auth-capabilities sub-clients. */
import { apiRoutes } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

export function capabilitiesGetMe(t: Transport) {
  const { req } = t;
  return {
    // The derived (path, method) surface + tools/agents the caller can reach
    // right now — the projection the Studio filters its nav and pages on.
    getMe: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_auth_me.path, s.meProjection, { signal }),
  };
}

export function capabilitiesGetCaps(t: Transport) {
  const { req } = t;
  return {
    // Whether this deployment can mint API keys locally (the settings key-create
    // UI gates on `mintable`). AUTHED.
    getAuthCapabilities: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_auth_capabilities.path, s.authCapabilities, { signal }),
  };
}
