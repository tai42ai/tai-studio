/** Backup section, document and import-report response schemas. */
import { z } from 'zod';

import { fleetReportFanout } from './fleet';

export const backupSections = z.array(z.object({ name: z.string(), secret: z.boolean() }));

/** The exported backup document — validated when the UI reads a picked file. */
export const backupDocument = z.object({
  version: z.literal(1),
  created_at: z.string(),
  sections: z.record(z.string(), z.unknown()),
  errors: z.record(z.string(), z.string()).optional(),
});
export type BackupDocument = z.infer<typeof backupDocument>;

export const backupImportReport = z.object({
  ok: z.boolean(),
  sections: z.record(
    z.string(),
    z.object({
      created: z.number(),
      updated: z.number(),
      skipped: z.number(),
      errors: z.array(z.string()),
      new_api_keys: z
        .array(
          z.object({
            user_id: z.string(),
            description: z.string(),
            api_key: z.string(),
          }),
        )
        .optional(),
      // The `manifest` and `env` sections apply through the config pipeline, so their
      // report carries the mode-wrapped fleet `fanout` of the restore's reload; other
      // sections omit it. Parsed EXPLICITLY so the shared fleet-report handler can
      // surface a failed restore propagation — otherwise zod would strip it silently.
      fanout: fleetReportFanout.optional(),
    }),
  ),
});
export type BackupImportReport = z.infer<typeof backupImportReport>;
