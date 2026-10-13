/** Studio front-end plugin registry response schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

/** One installed plugin's manifest plus `mounts`: its own route items and the absolute
 *  base each is served under on this deployment (`{item: "/api/<base>"}`). */
export const studioPluginListingEntry = openapi.studioPluginListingEntry;
export const studioPluginRegistry = openapi.studioPluginListing;
export type StudioPluginListingEntry = z.infer<typeof studioPluginListingEntry>;
