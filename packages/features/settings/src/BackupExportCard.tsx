/**
 * The Backup tab's Export card. A caller holding the export door picks sections
 * (secret ones start unchecked) and downloads the backup file; a caller without it
 * sees the sections listed read-only and a status line naming the access it needs.
 */
import {
  Badge,
  Button,
  Card,
  Checkbox,
  errorMessage,
  ErrorState,
  Spinner,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useState } from 'react';

import { checklistStyle, headingStyle, noteStyle, warningStyle } from './backup-styles';
import { ExportSectionErrors, readExportErrors } from './ExportSectionErrors';

export interface BackupSection {
  readonly name: string;
  readonly secret: boolean;
}

const sectionListStyle: CSSProperties = {
  ...checklistStyle,
  listStyle: 'none',
  margin: '0 0 var(--tai-space-3)',
  padding: 0,
};

const sectionRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
};

/** Trigger a browser download of a blob under the given filename. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer the revoke to the next tick — revoking synchronously can cancel the
  // download before the browser commits it.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function backupFilename(): string {
  return `tai-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

/** The Export card for a caller without the export door: the sections, read-only. */
export function ExportSectionList({
  sections,
}: {
  readonly sections: readonly BackupSection[];
}): ReactNode {
  return (
    <Card>
      <h3 style={headingStyle}>Export</h3>
      <ul style={sectionListStyle}>
        {sections.map((section) => (
          <li key={section.name} style={sectionRowStyle}>
            <span>{section.name}</span>
            {section.secret ? <Badge variant="warning">secret</Badge> : null}
          </li>
        ))}
      </ul>
      <p role="status" style={noteStyle}>
        Exporting a backup is an admin action.
      </p>
    </Card>
  );
}

export function ExportCard({
  sections,
}: {
  readonly sections: readonly BackupSection[];
}): ReactNode {
  const api = useApi();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(sections.filter((section) => !section.secret).map((section) => section.name)),
  );

  const mutation = useMutation({
    mutationFn: async (names: string[]) => {
      const blob = await api.exportBackup(names);
      return { blob, errors: await readExportErrors(blob) };
    },
    onSuccess: ({ blob }) => {
      triggerDownload(blob, backupFilename());
    },
  });
  const exportErrors = mutation.data?.errors ?? {};

  const toggle = (name: string, next: boolean): void => {
    setSelected((current) => {
      const updated = new Set(current);
      if (next) updated.add(name);
      else updated.delete(name);
      return updated;
    });
  };

  const secretChecked = sections.some((s) => s.secret && selected.has(s.name));
  const manifestChecked = selected.has('manifest');

  return (
    <Card>
      <h3 style={headingStyle}>Export</h3>
      <div style={checklistStyle}>
        {sections.map((section) => (
          <div key={section.name} style={sectionRowStyle}>
            <Checkbox
              label={section.name}
              checked={selected.has(section.name)}
              onCheckedChange={(next) => {
                toggle(section.name, next);
              }}
            />
            {section.secret ? <Badge variant="warning">secret</Badge> : null}
          </div>
        ))}
      </div>

      {secretChecked ? (
        <p role="alert" className="tai-warn-state" style={warningStyle}>
          This backup file will contain secrets/tokens — store it like a secret.
        </p>
      ) : null}
      {manifestChecked ? (
        <p style={noteStyle}>
          The manifest section may embed MCP tokens — handle the file with care.
        </p>
      ) : null}

      {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
      {Object.keys(exportErrors).length > 0 ? <ExportSectionErrors errors={exportErrors} /> : null}

      <Button
        type="button"
        variant="primary"
        disabled={selected.size === 0 || mutation.isPending}
        onClick={() => {
          mutation.mutate([...selected]);
        }}
      >
        {mutation.isPending ? <Spinner label="Exporting" /> : null}
        Export backup
      </Button>
    </Card>
  );
}
