/** Sub-MCP mount registry response schemas. */
import { z } from 'zod';

/**
 * One registered sub-MCP mount as it rides the registry list and the projection:
 * the tools it exposes, the transport it serves on, the served `mount_url` (the URL
 * the mount is served at and its route-table key) and the served `access_pattern`
 * (the dynamic route pattern mapping every sub-path of the mount to that key). In
 * `GET /api/sub-mcp` the slug is the map key, so the mount value carries no slug;
 * {@link subMcpEntry} extends this with `slug` for the capability projection where
 * mounts are a flat list. Every field is always present on the wire, so each is
 * required — an absence is a drift, not a legal shape.
 */
export const subMcpMount = z.object({
  tools: z.array(z.string()),
  transport: z.string(),
  mount_url: z.string(),
  access_pattern: z.string(),
});
export type SubMcpMount = z.infer<typeof subMcpMount>;

export const subMcpList = z.record(z.string(), subMcpMount);
export const subMcpCreated = z.object({
  slug: z.string(),
  tools: z.array(z.string()),
  transport: z.string(),
});
export const subMcpRemoved = z.object({ slug: z.string(), removed: z.literal(true) });
