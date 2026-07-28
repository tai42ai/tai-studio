/**
 * The Backup tab: export selected sections of the deployment to a JSON file and
 * restore them from a previously exported file.
 *
 * Export: a checkbox per available section (`listBackupSections`). Secret
 * sections default UNCHECKED with a warning; checking one shows a plain "this
 * file will contain secrets" note (the manifest gets a softer note). Export
 * downloads the returned blob as a file.
 *
 * Import: pick a file, parse it (loud on malformed JSON / wrong shape), choose
 * which of its sections to restore, then import. The per-section report
 * (created / updated / skipped / errors) renders in a table with error rows
 * highlighted; `ok: false` raises a loud failure banner. Any API keys minted by
 * an `access_control` restore are shown once in copy boxes.
 *
 * SAFETY: the backup file is operator-uploaded and fully untrusted, so EVERY
 * report field — including per-section error strings and minted-key metadata —
 * renders as ESCAPED text through the design-system components, never an HTML
 * sink. Read-only config mode disables importing (a write); export stays
 * available.
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangleIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  CopyField,
  EmptyState,
  ErrorState,
  FleetReport,
  ScrollRegion,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import { schemas, summarizeFleetFanout } from '@tai42/api-client';
import type { BackupImportReport } from '@tai42/api-client';

import { backupSectionsKey } from './keys';

interface Section {
  readonly name: string;
  readonly secret: boolean;
}

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const headingStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  fontSize: 'var(--tai-text-lg)',
  color: 'var(--tai-color-text)',
};

const checklistStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
  marginBottom: 'var(--tai-space-3)',
};

const sectionRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
};

// `.tai-warn-state` carries the panel itself — padding, tint, border, type — so the
// only thing left here is the gap to whatever follows the warning.
const warningStyle: CSSProperties = { margin: '0 0 var(--tai-space-3)' };

const noteStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

// A destructive-action surface: a restore overwrites live config, so it wears the
// design system's danger ground — danger-surface tint, err-text ink, and the
// alert-triangle mark carrying the severity alongside the colour (never colour
// alone). Shared by the top-of-import danger-zone note and the failure banner.
const dangerPanelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--tai-space-2)',
  margin: '0 0 var(--tai-space-3)',
  padding: 'var(--tai-space-3)',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-err-text)',
  background: 'var(--tai-color-danger-surface)',
  color: 'var(--tai-color-err-text)',
  fontSize: 'var(--tai-text-sm)',
};

const failureBannerStyle: CSSProperties = {
  ...dangerPanelStyle,
  fontWeight: 600,
};

const errorListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 'var(--tai-space-4)',
  color: 'var(--tai-color-err-text)',
  fontSize: 'var(--tai-text-sm)',
};

const mintedStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
  marginTop: 'var(--tai-space-4)',
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

// -- export ------------------------------------------------------------------

function ExportCard({ sections }: { readonly sections: readonly Section[] }): ReactNode {
  const api = useApi();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(sections.filter((section) => !section.secret).map((section) => section.name)),
  );

  const mutation = useMutation({
    mutationFn: (names: string[]) => api.exportBackup(names),
    onSuccess: (blob) => {
      triggerDownload(blob, backupFilename());
    },
  });

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

// -- import ------------------------------------------------------------------

function ImportReportTable({ report }: { readonly report: BackupImportReport }): ReactNode {
  const entries = Object.entries(report.sections);
  const minted = entries.flatMap(([name, section]) =>
    (section.new_api_keys ?? []).map((key) => ({ section: name, ...key })),
  );
  // The `manifest` and `env` restores apply through the config pipeline, so their
  // report carries a fleet fan-out; surface any failed propagation honestly.
  const fleetReports = entries
    .map(([name, section]) => ({ name, summary: summarizeFleetFanout(section.fanout) }))
    .filter((entry) => entry.summary !== null);

  return (
    <div>
      {report.ok ? null : (
        <p role="alert" style={failureBannerStyle}>
          <AlertTriangleIcon />
          <span>Import failed — one or more sections reported errors. See the report below.</span>
        </p>
      )}
      <ScrollRegion label="Import report">
        <Table>
          <THead>
            <TR>
              <TH>Section</TH>
              <TH numeric>Created</TH>
              <TH numeric>Updated</TH>
              <TH numeric>Skipped</TH>
              <TH>Errors</TH>
            </TR>
          </THead>
          <TBody>
            {entries.map(([name, section]) => {
              const hasErrors = section.errors.length > 0;
              return (
                <TR
                  key={name}
                  data-testid={`report-row-${name}`}
                  style={hasErrors ? { background: 'var(--tai-color-danger-surface)' } : undefined}
                >
                  <TD className="tai-mono">{name}</TD>
                  <TD numeric>{section.created}</TD>
                  <TD numeric>{section.updated}</TD>
                  <TD numeric>{section.skipped}</TD>
                  <TD>
                    {hasErrors ? (
                      <ul style={errorListStyle}>
                        {section.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    ) : (
                      <span style={{ color: 'var(--tai-color-text-muted)' }}>—</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </ScrollRegion>

      {fleetReports.map((entry) => (
        <div key={entry.name} style={{ marginTop: 'var(--tai-space-3)' }}>
          <FleetReport summary={entry.summary} />
        </div>
      ))}

      {minted.length > 0 ? (
        <div style={mintedStyle}>
          <p className="tai-warn-state" style={warningStyle}>
            New API keys were minted during restore — copy them now, they cannot be retrieved again.
          </p>
          {minted.map((key) => (
            <CopyField
              key={`${key.section}-${key.user_id}`}
              value={key.api_key}
              label={`${key.user_id} — ${key.description}`}
              idPrefix={`minted-${key.user_id}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ImportCard({ readOnly }: { readonly readOnly: boolean }): ReactNode {
  const api = useApi();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [document_, setDocument_] = useState<unknown>(null);
  const [docSections, setDocSections] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);
  const [report, setReport] = useState<BackupImportReport | null>(null);

  const mutation = useMutation({
    mutationFn: (body: { document: unknown; sections: string[] }) => api.importBackup(body),
    onSuccess: (result) => {
      setReport(result);
    },
  });

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    setParseError(null);
    setReport(null);
    mutation.reset();
    void file.text().then(
      (text) => {
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          setParseError('The selected file is not valid JSON.');
          setDocument_(null);
          return;
        }
        const parsed = schemas.backupDocument.safeParse(raw);
        if (!parsed.success) {
          setParseError('The selected file is not a valid backup document.');
          setDocument_(null);
          return;
        }
        const names = Object.keys(parsed.data.sections);
        setDocument_(raw);
        setDocSections(names);
        setSelected(new Set(names));
      },
      (error: unknown) => {
        setParseError(errorMessage(error));
        setDocument_(null);
      },
    );
  };

  const toggle = (name: string, next: boolean): void => {
    setSelected((current) => {
      const updated = new Set(current);
      if (next) updated.add(name);
      else updated.delete(name);
      return updated;
    });
  };

  return (
    <Card>
      <h3 style={headingStyle}>Import</h3>

      {readOnly ? (
        <p role="note" style={noteStyle}>
          Configuration is read-only for this deployment. Backups cannot be imported here.
        </p>
      ) : (
        <>
          {/* A restore is destructive — it overwrites live deployment config — so the
              whole import surface is fronted by the danger ground: the alert mark plus
              err-text on the danger tint, and the restore action itself is a danger button. */}
          <p style={dangerPanelStyle}>
            <AlertTriangleIcon />
            <span>
              Restoring a backup overwrites this deployment&rsquo;s configuration for the selected
              sections and cannot be undone.
            </span>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            aria-label="Backup file"
            style={{ display: 'none' }}
            onChange={onFileChange}
          />
          <Button
            type="button"
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            Choose backup file
          </Button>

          {parseError !== null ? (
            <div style={{ marginTop: 'var(--tai-space-3)' }}>
              <ErrorState message={parseError} />
            </div>
          ) : null}

          {document_ !== null ? (
            <div style={{ marginTop: 'var(--tai-space-4)' }}>
              <h4 style={headingStyle}>Sections to restore</h4>
              <div style={checklistStyle}>
                {docSections.map((name) => (
                  <Checkbox
                    key={name}
                    label={name}
                    checked={selected.has(name)}
                    onCheckedChange={(next) => {
                      toggle(name, next);
                    }}
                  />
                ))}
              </div>
              {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
              <Button
                type="button"
                variant="danger"
                disabled={selected.size === 0 || mutation.isPending}
                onClick={() => {
                  mutation.mutate({ document: document_, sections: [...selected] });
                }}
              >
                {mutation.isPending ? <Spinner label="Importing" /> : null}
                Import selected
              </Button>
            </div>
          ) : null}
        </>
      )}

      {report !== null ? (
        <div style={{ marginTop: 'var(--tai-space-4)' }}>
          <ImportReportTable report={report} />
        </div>
      ) : null}
    </Card>
  );
}

// -- main --------------------------------------------------------------------

export interface BackupTabProps {
  readonly readOnly: boolean;
}

export function BackupTab({ readOnly }: BackupTabProps): ReactNode {
  const api = useApi();

  const sectionsQuery = useQuery({
    queryKey: backupSectionsKey,
    queryFn: ({ signal }) => api.listBackupSections(signal),
  });

  if (sectionsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(sectionsQuery.error)}
        onRetry={() => {
          void sectionsQuery.refetch();
        }}
      />
    );
  }
  if (sectionsQuery.isPending) {
    return <Spinner label="Loading backup sections" />;
  }

  const sections = sectionsQuery.data;

  return (
    <div style={stackStyle}>
      {sections.length === 0 ? (
        <Card>
          <EmptyState
            title="No backup sections"
            description="This deployment exposes no backup sections."
          />
        </Card>
      ) : (
        <ExportCard sections={sections} />
      )}
      <ImportCard readOnly={readOnly} />
    </div>
  );
}
