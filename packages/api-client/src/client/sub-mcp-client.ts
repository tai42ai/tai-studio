/** Sub-MCP mount registry sub-client. */
import * as s from '../schemas';
import { encodeSegment } from '../http';
import type { Transport } from './transport';

export function subMcpClient(t: Transport) {
  const { req } = t;
  return {
    listSubMcp: (signal?: AbortSignal) => req('/api/sub-mcp', s.subMcpList, { signal }),
    // `transport` is optional at the client boundary (the server defaults it to
    // `http`); when omitted, JSON.stringify drops the undefined key from the body.
    createSubMcp: (slug: string, tools: string[], transport?: string) =>
      req('/api/sub-mcp', s.subMcpCreated, { method: 'POST', body: { slug, tools, transport } }),
    deleteSubMcp: (slug: string) =>
      req(`/api/sub-mcp/${encodeSegment(slug)}`, s.subMcpRemoved, { method: 'DELETE' }),
  };
}
