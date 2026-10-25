/**
 * The Backup tab: export selected sections of the deployment to a JSON file and
 * restore them from a previously exported file.
 *
 * Export: a checkbox per available section (`listBackupSections`). Secret
 * sections default UNCHECKED with a warning; checking one shows a plain "this
 * file will contain secrets" note (the manifest gets a softer note). Export
 * downloads the returned blob as a file, then reads the document's `errors` map:
 * each section whose exporter failed is absent from the file and is named, with
 * its message, in a warning under the export controls.
 *
 * Import: pick a file, parse it (loud on malformed JSON / wrong shape), choose
 * which of its sections to restore, then import. The per-section report
 * (created / updated / skipped / errors) renders in a table with error rows
 * highlighted; `ok: false` raises a loud failure banner. Any API keys minted by
 * an `access_control` restore are shown once in copy boxes.
 *
 * Export and import are admin actions, each checked on its own door through
 * `useCanWrite`. A caller who reads the sections without them sees the sections
 * listed and, in place of each action, a status line naming the access it needs. A
 * read-only deployment blocks import for an admin; export stays available.
 *
 * SAFETY: the backup file is operator-uploaded and fully untrusted, so EVERY
 * report field — including per-section error strings (import and export) and
 * minted-key metadata — renders as ESCAPED text through the design-system components, never an HTML
 * sink.
 */
import type { BackupImportReport, RecycleRoll } from '@tai42/api-client';
import { apiRoutes, schemas, summarizeFleetFanout } from '@tai42/api-client';
import {
  AlertTriangleIcon,
  Button,
  Card,
  Checkbox,
  CopyField,
  EmptyState,
  errorMessage,
  ErrorState,
  FleetReport,
  ScrollRegion,
  Spinner,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useApi,
  useCanWrite,
} from '@tai42/studio-sdk';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useId, useRef, useState } from 'react';

import { checklistStyle, headingStyle, noteStyle, warningStyle } from './backup-styles';
import { ExportCard, ExportSectionList } from './BackupExportCard';
import { backupSectionsKey } from './keys';
import { RecycleRollSection } from './RecycleRollSection';

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

// A destructive-action surface: a restore overwrites live config, so it wears the
// design system's error ground — err-tint, err-text ink, and the
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
  background: 'var(--tai-color-err-tint)',
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

const recycleTitleStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-2)',
  fontSize: 'var(--tai-text-md)',
  color: 'var(--tai-color-text)',
};

const mintedStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
  marginTop: 'var(--tai-space-4)',
};

// -- import ------------------------------------------------------------------

/** The fleet recycle a section restore of recycle-class keys ran: why, then the rows. */
function RestoreRecycleReport({
  section,
  roll,
}: {
  readonly section: string;
  readonly roll: RecycleRoll;
}): ReactNode {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-testid={`report-recycle-${section}`}
      style={{ marginTop: 'var(--tai-space-3)' }}
    >
      <h4 id={headingId} style={recycleTitleStyle}>
        Worker recycle — <span className="tai-mono">{section}</span>
      </h4>
      <p style={noteStyle}>
        Some restored settings take effect only in a fresh worker process, so the fleet recycled its
        workers one at a time.
      </p>
      <RecycleRollSection
        recycle={roll.recycle}
        fresh={roll.fresh}
        stopped={roll.recycle_stopped}
        writerNote="this worker recycles itself after replying"
      />
    </section>
  );
}

function ImportReportTable({ report }: { readonly report: BackupImportReport }): ReactNode {
  const entries = Object.entries(report.sections);
  const minted = entries.flatMap(([name, section]) =>
    (section.details.new_api_keys ?? []).map((key) => ({ section: name, ...key })),
  );
  // A section whose restore broadcast (the `manifest` and `env` reloads, the templates
  // cache eviction) carries a fleet fan-out; surface any failed propagation honestly, with
  // the workers the restore leaves awaiting a respawn.
  const fleetReports = entries
    .map(([name, section]) => ({
      name,
      summary: summarizeFleetFanout(section.fanout, section.awaiting_respawn),
    }))
    .filter((entry) => entry.summary !== null);
  const recycleRolls = entries.flatMap(([name, section]) =>
    section.recycle === null ? [] : [{ name, roll: section.recycle }],
  );

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
                  style={hasErrors ? { background: 'var(--tai-color-err-tint)' } : undefined}
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

      {recycleRolls.map((entry) => (
        <RestoreRecycleReport key={entry.name} section={entry.name} roll={entry.roll} />
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

function ImportCard({
  readOnly,
  canImport,
}: {
  readonly readOnly: boolean;
  readonly canImport: boolean;
}): ReactNode {
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

      {!canImport ? (
        <p role="status" style={noteStyle}>
          Importing a backup is an admin action.
        </p>
      ) : readOnly ? (
        <p role="note" style={noteStyle}>
          Configuration is read-only for this deployment. Backups cannot be imported here.
        </p>
      ) : (
        <>
          {/* A restore is destructive — it overwrites live deployment config — so the
              whole import surface is fronted by the danger ground: the alert mark plus
              err-text on the err-tint, and the restore action itself is a danger button. */}
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
  const canExport = useCanWrite(apiRoutes.post_api_backup_export.path);
  const canImport = useCanWrite(apiRoutes.post_api_backup_import.path);

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
      ) : canExport ? (
        <ExportCard sections={sections} />
      ) : (
        <ExportSectionList sections={sections} />
      )}
      <ImportCard readOnly={readOnly} canImport={canImport} />
    </div>
  );
}
