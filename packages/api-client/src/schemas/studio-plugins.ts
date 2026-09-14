/** Studio front-end plugin registry response schemas. */
import { z } from 'zod';

export const studioPluginManifest = z.object({
  name: z.string(),
  version: z.string(),
  api_version: z.number(),
  entry: z.string(),
  integrity: z.record(z.string(), z.string()),
  contributions: z.object({
    tool_panels: z.record(z.string(), z.string()).default({}),
    pages: z.array(z.string()).default([]),
    settings_tabs: z.array(z.string()).default([]),
    // Optional with a default so a manifest without the field still parses; the
    // non-strict object would otherwise SILENTLY STRIP an undeclared field, so a
    // server that serves `nav_entries` would never reach the UI.
    nav_entries: z.array(z.string()).default([]),
  }),
});
export const studioPluginRegistry = z.array(studioPluginManifest);
export type StudioPluginManifest = z.infer<typeof studioPluginManifest>;
