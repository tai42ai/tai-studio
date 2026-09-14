/** Sub-MCP mount registry response schemas. */
import { z } from 'zod';

/**
 * One registered sub-MCP mount as it rides the registry list and the projection:
 * the tools it exposes and the transport it serves on. In `GET /api/sub-mcp` the
 * slug is the map key, so the mount value carries no slug; {@link subMcpEntry}
 * extends this with `slug` for the capability projection where mounts are a flat
 * list. `transport` is always present on the wire (the server defaults it to
 * `http`), so it is required — its absence is a drift, not a legal shape.
 */
export const subMcpMount = z.object({
  tools: z.array(z.string()),
  transport: z.string(),
});
export type SubMcpMount = z.infer<typeof subMcpMount>;

export const subMcpList = z.record(z.string(), subMcpMount);
export const subMcpCreated = z.object({
  slug: z.string(),
  tools: z.array(z.string()),
  transport: z.string(),
});
export const subMcpRemoved = z.object({ slug: z.string(), removed: z.literal(true) });
