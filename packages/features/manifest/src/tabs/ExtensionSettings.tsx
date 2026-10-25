/**
 * The extension settings the preserved manifest declares (`GET /api/manifest`, the
 * query `ManifestTab` reads, so one fetch serves both): the extension modules, the
 * backend module, and one table row per (entry, tool) of the `tools`, `mcp` and
 * `api_tools` extension maps, each combo rendered by `ExtensionCombo`.
 */
import type { ManifestExtensionSettings, PresetExtensionElement } from '@tai42/api-client';
import {
  EmptyState,
  errorMessage,
  ErrorState,
  ScrollRegion,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useApi,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { manifestKey } from '../keys';
import { ExtensionCombo } from './ExtensionCombo';

/** One row of the maps table: where the map sits, the tool it maps, and its combos. */
interface MapRow {
  readonly where: string;
  readonly tool: string;
  readonly combos: readonly (readonly PresetExtensionElement[])[];
}

function mapRows(settings: ManifestExtensionSettings): MapRow[] {
  const rows: MapRow[] = [];
  for (const entry of settings.tools) {
    for (const [tool, combos] of Object.entries(entry.extensions)) {
      rows.push({ where: `tools › ${entry.title}`, tool, combos });
    }
  }
  for (const entry of settings.mcp) {
    for (const [tool, combos] of Object.entries(entry.extensions)) {
      rows.push({ where: `mcp › ${entry.title}`, tool, combos });
    }
  }
  for (const [tool, combos] of Object.entries(settings.api_tools)) {
    rows.push({ where: 'api_tools', tool, combos });
  }
  return rows;
}

function None(): ReactNode {
  return <span className="tai-muted">None</span>;
}

function SettingsBody({ settings }: { readonly settings: ManifestExtensionSettings }): ReactNode {
  const rows = mapRows(settings);
  if (
    settings.extensions_modules.length === 0 &&
    settings.backend_module === null &&
    rows.length === 0
  ) {
    return (
      <EmptyState
        title="No extension settings"
        description="The manifest declares no extension modules, no backend module and no extension maps."
      />
    );
  }
  return (
    <div className="tai-stack tai-stack-3">
      <dl className="tai-stack tai-stack-2" style={{ margin: 0 }}>
        <dt className="tai-field-label">Extension modules</dt>
        <dd style={{ margin: 0 }}>
          {settings.extensions_modules.length === 0 ? (
            <None />
          ) : (
            <ul className="tai-stack tai-stack-2" style={{ margin: 0 }}>
              {settings.extensions_modules.map((module) => (
                <li key={module} className="tai-mono">
                  {module}
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt className="tai-field-label">Backend module</dt>
        <dd style={{ margin: 0 }}>
          {settings.backend_module === null ? (
            <None />
          ) : (
            <span className="tai-mono">{settings.backend_module}</span>
          )}
        </dd>
      </dl>
      <h4 className="tai-field-label" style={{ margin: 0 }}>
        Extension maps
      </h4>
      {rows.length === 0 ? (
        <span className="tai-muted">No tool in the manifest has extensions attached.</span>
      ) : (
        <ScrollRegion label="Extension maps">
          <Table>
            <caption className="tai-visually-hidden">
              Extension maps declared in the manifest
            </caption>
            <THead>
              <TR>
                <TH>Where</TH>
                <TH>Tool</TH>
                <TH>Combos</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={`${row.where}\u0000${row.tool}`}>
                  <TD>{row.where}</TD>
                  <TD className="tai-mono">{row.tool}</TD>
                  <TD>
                    <div className="tai-stack tai-stack-2">
                      {row.combos.map((combo, index) => (
                        // Combos carry no identity of their own; their order is the map's.
                        <ExtensionCombo key={String(index)} combo={combo} />
                      ))}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </ScrollRegion>
      )}
    </div>
  );
}

function ExtensionSettingsBody(): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: manifestKey,
    queryFn: ({ signal }) => api.getManifest(signal),
  });
  if (query.isPending) {
    return (
      <div className="tai-stack tai-stack-2">
        <Skeleton height={16} />
        <Skeleton height={16} />
        <Skeleton height={16} />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <SettingsBody settings={query.data.extension_settings} />;
}

export function ExtensionSettings(): ReactNode {
  return (
    <div className="tai-stack tai-stack-3">
      <h3 className="tai-card-title">In the manifest</h3>
      <ExtensionSettingsBody />
    </div>
  );
}
