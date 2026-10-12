/** Backup section, document and import-report response schemas. */
import { z } from 'zod';

import { awaitingWorker, fleetReportFanout, recycleRoll } from './fleet';

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
      // The section's own open map of counts and data (a `skipped_existing` tally, say). The
      // one entry the report renders is `new_api_keys`: the keys an `access_control` restore
      // minted, each plaintext sent only in this reply.
      details: z
        .object({
          new_api_keys: z
            .array(
              z.object({
                user_id: z.string(),
                description: z.string(),
                api_key: z.string(),
              }),
            )
            .optional(),
        })
        .loose(),
      // The mode-wrapped fleet `fanout` of a section whose restore broadcast (the `manifest`
      // and `env` reloads, the templates cache eviction); `null` for every other section.
      // Parsed EXPLICITLY so the shared fleet-report handler can surface a failed restore
      // propagation — otherwise zod would strip it silently.
      fanout: fleetReportFanout.nullable(),
      // An `env` restore that changed recycle-class keys rolls a fleet recycle: `recycle` is
      // that roll (`null` when none ran) and `awaiting_respawn` the workers (name + keys) still
      // awaiting a respawn after it — the operation's verdict, empty for every other section.
      recycle: recycleRoll.nullable(),
      awaiting_respawn: z.array(awaitingWorker),
    }),
  ),
});
export type BackupImportReport = z.infer<typeof backupImportReport>;
