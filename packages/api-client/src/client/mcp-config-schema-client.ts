/** MCP config-schema read sub-client. */
import { apiRoutes } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

export function mcpConfigSchemaClient(t: Transport) {
  const { req } = t;
  return {
    getMcpConfigSchema: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_mcp_config_schema.path, s.jsonSchema, { signal }),
  };
}
