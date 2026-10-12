/** Sub-MCP mount registry sub-client. */
import { apiRoutes, buildPath } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

export function subMcpClient(t: Transport) {
  const { req } = t;
  return {
    listSubMcp: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_sub_mcp.path, s.subMcpList, { signal }),
    // `transport` is optional at the client boundary (the server defaults it to
    // `http`); when omitted, JSON.stringify drops the undefined key from the body.
    createSubMcp: (slug: string, tools: string[], transport?: string) =>
      req(apiRoutes.post_api_sub_mcp.path, s.subMcpCreated, {
        method: 'POST',
        body: { slug, tools, transport },
      }),
    deleteSubMcp: (slug: string) =>
      req(buildPath(apiRoutes.delete_api_sub_mcp_slug.path, { slug }), s.subMcpRemoved, {
        method: 'DELETE',
      }),
  };
}
