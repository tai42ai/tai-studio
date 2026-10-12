/** Backup section, document and import-report response schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';
import { fleetReportFanout } from './fleet';

export const backupSections = openapi.backupSectionListing;

/**
 * A backup document as the import door accepts it — validated when the UI reads a picked
 * file. Hand-written over the export's document: the import door takes `version` 1 and a
 * `sections` object, and the export's `errors` map is optional there.
 */
export const backupDocument = openapi.backupExportDocument.extend({
  version: z.literal(1),
  errors: openapi.backupExportDocument.shape.errors.optional(),
});
export type BackupDocument = z.infer<typeof backupDocument>;

// Hand-written: the spec publishes a section's fan-out as one object with optional fields
// and its `details` as an open map; the client discriminates the fan-out's modes and reads
// the keys a restore minted.
/** The api keys a restore minted, shown once: carried in a section report's `details`. */
export const backupNewApiKeys = z.array(
  z.object({ user_id: z.string(), description: z.string(), api_key: z.string() }),
);
export type BackupNewApiKeys = z.infer<typeof backupNewApiKeys>;

export const backupSectionReport = openapi.backupSectionReport.extend({
  // The `manifest` and `env` sections apply through the config pipeline, so their
  // report carries the mode-wrapped fleet `fanout` of the restore's reload; other
  // sections carry `null`. Parsed EXPLICITLY so the shared fleet-report handler can
  // surface a failed restore propagation.
  fanout: fleetReportFanout.nullable().default(null),
  details: z
    .object({ new_api_keys: backupNewApiKeys.optional() })
    .catchall(z.unknown())
    .default({}),
});
export type BackupSectionReport = z.infer<typeof backupSectionReport>;

export const backupImportReport = openapi.backupImportResult.extend({
  sections: z.record(z.string(), backupSectionReport),
});
export type BackupImportReport = z.infer<typeof backupImportReport>;
