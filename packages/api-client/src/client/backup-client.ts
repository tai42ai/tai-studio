/** Backup section listing, export and import sub-client. */
import { apiDownload } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

export function backupClient(t: Transport) {
  const { config, req } = t;
  return {
    listBackupSections: (signal?: AbortSignal) =>
      req('/api/backup/sections', s.backupSections, { signal }),
    exportBackup: (sections: string[], signal?: AbortSignal): Promise<Blob> =>
      apiDownload(config, '/api/backup/export', { method: 'POST', body: { sections }, signal }),
    importBackup: (body: { document: unknown; sections: string[] }) =>
      req('/api/backup/import', s.backupImportReport, { method: 'POST', body }),
  };
}
