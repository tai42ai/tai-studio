/** Sub-MCP mount registry response schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

/**
 * One registered sub-MCP mount as it rides the registry list: the tools it exposes, the
 * transport it serves on, the served `mount_url` (the URL the mount is served at and its
 * route-table key) and the served `access_pattern` (the dynamic route pattern mapping every
 * sub-path of the mount to that key). In `GET /api/sub-mcp` the slug is the map key, so the
 * mount value carries no slug.
 */
export const subMcpMount = openapi.subMcpListingEntry;
export type SubMcpMount = z.infer<typeof subMcpMount>;

export const subMcpList = openapi.subMcpMapListing;
export const subMcpCreated = openapi.subMcpRegistrationResult;
export const subMcpRemoved = openapi.subMcpRemovalResult;
