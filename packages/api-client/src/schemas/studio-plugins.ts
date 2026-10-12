/** Studio front-end plugin registry response schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

export const studioPluginManifest = openapi.studioPluginManifest;
export const studioPluginRegistry = openapi.studioPluginListing;
export type StudioPluginManifest = z.infer<typeof studioPluginManifest>;
