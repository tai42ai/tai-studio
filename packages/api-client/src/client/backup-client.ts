/** Backup section listing, export and import sub-client. */
import { apiRoutes } from '../generated/api-routes';
import { apiDownload } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

export function backupClient(t: Transport) {
  const { config, req } = t;
  return {
    listBackupSections: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_backup_sections.path, s.backupSections, { signal }),
    exportBackup: (sections: string[], signal?: AbortSignal): Promise<Blob> =>
      apiDownload(config, apiRoutes.post_api_backup_export.path, {
        method: 'POST',
        body: { sections },
        signal,
      }),
    importBackup: (body: { document: unknown; sections: string[] }) =>
      req(apiRoutes.post_api_backup_import.path, s.backupImportReport, { method: 'POST', body }),
  };
}
