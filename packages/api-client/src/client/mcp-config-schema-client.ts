/** MCP config-schema read sub-client. */
import * as s from '../schemas';
import type { Transport } from './transport';

export function mcpConfigSchemaClient(t: Transport) {
  const { req } = t;
  return {
    getMcpConfigSchema: (signal?: AbortSignal) =>
      req('/api/mcp-config/schema', s.jsonSchema, { signal }),
  };
}
