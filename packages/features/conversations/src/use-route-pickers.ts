/**
 * The reads the route form's pickers draw from: the registered agents, the registered
 * tools, the installed channels and the api-key list, each under the SDK's shared query
 * key so another screen's cached read serves the form and the form's serves it. The
 * pickers themselves are presentational (in the SDK); this feature owns the queries.
 * The key list runs only while the Execution key field shows (a checked binding).
 */
import type { AgentListing, Channels, TokensPayload } from '@tai42/api-client';
import {
  agentsListKey,
  channelsListKey,
  type ExecutionKeyBinding,
  tokensPayloadKey,
  toolsListKey,
  useApi,
  useExecutionKeyBinding,
} from '@tai42/studio-sdk';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export interface RoutePickers {
  readonly agents: UseQueryResult<AgentListing>;
  readonly tools: UseQueryResult<string[]>;
  readonly channels: UseQueryResult<Channels>;
  readonly keys: UseQueryResult<TokensPayload>;
  /** How the form binds its execution key (`useExecutionKeyBinding()`). */
  readonly binding: ExecutionKeyBinding;
}

export function useRoutePickers(): RoutePickers {
  const api = useApi();
  const binding = useExecutionKeyBinding();
  const agents = useQuery({
    queryKey: agentsListKey,
    queryFn: ({ signal }) => api.listAgents(signal),
  });
  const tools = useQuery({
    queryKey: toolsListKey,
    queryFn: ({ signal }) => api.listTools(signal),
  });
  const channels = useQuery({
    queryKey: channelsListKey,
    queryFn: ({ signal }) => api.listChannels(signal),
  });
  const keys = useQuery({
    queryKey: tokensPayloadKey,
    queryFn: ({ signal }) => api.listTokensPayload(signal),
    enabled: binding.mode === 'checked',
  });
  return { agents, tools, channels, keys, binding };
}
