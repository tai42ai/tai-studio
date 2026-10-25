/**
 * The sections a backup export left out of its downloaded file.
 *
 * The export door answers with the backup document itself; a section whose exporter
 * failed is absent from its `sections` and named, with its message, in its `errors`
 * map. `readExportErrors` reads that map from the downloaded blob, and
 * `ExportSectionErrors` names each failed section with its message on the design
 * system's warn ground. Every server string renders as escaped React text.
 */
import { schemas } from '@tai42/api-client';
import { AlertTriangleIcon } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

/** Each section whose exporter failed, mapped to its message. */
export type ExportErrors = Readonly<Record<string, string>>;

// `.tai-warn-state` carries the panel itself; only the gap to what follows is local.
const panelStyle: CSSProperties = { margin: '0 0 var(--tai-space-3)' };

/** Read the downloaded backup document's per-section `errors` map. */
export async function readExportErrors(blob: Blob): Promise<ExportErrors> {
  return schemas.backupExportDocument.parse(JSON.parse(await blob.text())).errors;
}

export function ExportSectionErrors({ errors }: { readonly errors: ExportErrors }): ReactNode {
  const entries = Object.entries(errors);
  const count = entries.length;
  return (
    <div
      role="alert"
      data-testid="export-section-errors"
      className="tai-warn-state tai-stack tai-stack-2"
      style={panelStyle}
    >
      <strong className="tai-status tai-status-warn">
        <AlertTriangleIcon />
        {`Backup downloaded, but ${String(count)} section${count === 1 ? '' : 's'} failed to export`}
      </strong>
      <p>{count === 1 ? 'This section is' : 'These sections are'} not in the downloaded file.</p>
      <ul className="tai-stack tai-stack-2">
        {entries.map(([name, message]) => (
          <li key={name} data-testid={`export-error-${name}`} className="tai-row">
            <span className="tai-mono">{name}</span>
            <span className="tai-muted">{message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
