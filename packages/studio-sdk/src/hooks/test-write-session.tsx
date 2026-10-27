/**
 * Test harness: the signed-in provider stack a write affordance reads its gates from
 * (API client, auth, capability projection, kind-status table), with the projection
 * and the kind table supplied by the test.
 */
import type { ApiClient, KindStatus, MeProjection } from '@tai42/api-client';
import type { ReactNode } from 'react';

import { ApiProvider } from './useApi';
import { AuthProvider } from './useAuth';
import { CapabilityProvider } from './useCapabilities';
import { SystemKindsProvider } from './useSystemKinds';

/** The session key `AuthProvider` seeds from, so the providers fetch. */
const SESSION_KEY = 'tai-studio.apiKey';

const BASE_PROJECTION: MeProjection = {
  access_control_enabled: true,
  user_id: 'u-test',
  owner_user_id: null,
  principal: null,
  admin: false,
  public_resource_id: 'public',
  scopes: [],
  routes: [],
  route_patterns: [],
  sub_mcp: [],
  tools: [],
  agents: [],
  mintable: false,
};

/** A total (admin) projection: every write reachable. */
export const FULL_PROJECTION: MeProjection = { ...BASE_PROJECTION, admin: true };

/** A scoped projection reaching exactly the given `method path` pairs. */
export function projectionReaching(
  ...routes: readonly { readonly method: string; readonly path: string }[]
): MeProjection {
  return {
    ...BASE_PROJECTION,
    routes: routes.map((route) => ({ path: route.path, methods: [route.method] })),
  };
}

/** A wrapper mounting the signed-in stack over `client`. */
export function writeSession(
  client: Partial<ApiClient>,
  {
    projection = FULL_PROJECTION,
    kinds = [],
  }: { projection?: MeProjection; kinds?: readonly KindStatus[] } = {},
): (props: { children: ReactNode }) => ReactNode {
  globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  const api = {
    ...client,
    getMe: () => Promise.resolve(projection),
    getSystemKinds: () => Promise.resolve([...kinds]),
  } as unknown as ApiClient;
  return function WriteSession({ children }: { children: ReactNode }): ReactNode {
    return (
      <ApiProvider value={api}>
        <AuthProvider>
          <CapabilityProvider>
            <SystemKindsProvider>{children}</SystemKindsProvider>
          </CapabilityProvider>
        </AuthProvider>
      </ApiProvider>
    );
  };
}
