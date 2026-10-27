/**
 * One preset as the list shows it — its table cells (Name, Base tool, Description,
 * Active version, Tags, Extensions) and its card — shared by the active-preset
 * explorer and the conflicted table, so both read a preset the same way.
 *
 * The Name cell carries the tool's overlay DISPLAY NAME (from `listToolMeta`) as a
 * muted sub-line, and the Tags column renders the tool's OVERLAY tags. A conflicted
 * preset adds the danger badge and the server's `conflicted_reason`.
 *
 * SAFETY: a preset carries arbitrary server-supplied strings, so every cell renders
 * them as ESCAPED text through the DS components, never an HTML sink.
 */
import type { PresetRecord } from '@tai42/api-client';
import { AppLink, Badge, Card, type ExplorerColumn, TD } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import { TagChips } from './tags';

/** A tool's overlay projection the cells read: its display name + user tags. */
export interface OverlayDetail {
  readonly displayName: string | null;
  readonly tags: readonly string[];
}

/** The generic fallback shown when a conflicted row carries no server reason. */
const GENERIC_CONFLICT_REASON =
  'Name collided with an existing tool at startup — delete to resolve.';

/** The list's columns, in cell order. */
export const PRESET_COLUMNS: readonly ExplorerColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'base', header: 'Base tool' },
  { key: 'description', header: 'Description' },
  { key: 'version', header: 'Active version' },
  { key: 'tags', header: 'Tags' },
  { key: 'extensions', header: 'Extensions' },
];

const linkStyle: CSSProperties = {
  color: 'var(--tai-color-accent)',
  textDecoration: 'none',
  fontFamily: 'var(--tai-font-mono)',
  // The name is one token: keep it on a single line so auto table layout gives the
  // column its width rather than collapsing it to a character. The scroll region
  // scrolls a very long name; sibling sub-lines (display name, reason) still wrap.
  whiteSpace: 'nowrap',
};

const mutedStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

interface PresetEntryProps {
  readonly preset: PresetRecord;
  readonly overlay: OverlayDetail | undefined;
  readonly selected: boolean;
}

/** The name link (sets `?preset=`), the display-name sub-line and, for a conflicted
 *  preset, its badge and reason. */
function PresetName({ preset, overlay, selected }: PresetEntryProps): ReactNode {
  const displayName = overlay?.displayName ?? null;
  return (
    <>
      <AppLink
        to="presets"
        search={{ preset: preset.name }}
        aria-label={`Open preset ${preset.name}`}
        aria-current={selected ? 'page' : undefined}
      >
        <span style={linkStyle}>{preset.name}</span>
      </AppLink>
      {displayName !== null && displayName !== '' ? (
        <div style={mutedStyle} data-testid={`preset-display-name-${preset.name}`}>
          {displayName}
        </div>
      ) : null}
      {preset.conflicted ? (
        <div
          data-testid={`preset-conflicted-${preset.name}`}
          style={{
            marginTop: 'var(--tai-space-1)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--tai-space-1)',
          }}
        >
          <span>
            <Badge variant="danger">Conflicted</Badge>
          </span>
          <span style={mutedStyle}>{preset.conflicted_reason ?? GENERIC_CONFLICT_REASON}</span>
        </div>
      ) : null}
    </>
  );
}

/** The preset's table cells, one per {@link PRESET_COLUMNS} entry. */
export function PresetCells(props: PresetEntryProps): ReactNode {
  const { preset, overlay } = props;
  const tags = overlay?.tags ?? [];
  return (
    <>
      <TD>
        <PresetName {...props} />
      </TD>
      <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{preset.base_tool}</TD>
      <TD>{preset.description || '—'}</TD>
      <TD>{preset.active_version}</TD>
      <TD>{tags.length > 0 ? <TagChips tags={tags} /> : '—'}</TD>
      <TD>{preset.extensions.length}</TD>
    </>
  );
}

/** The preset's card for the explorer's card view. */
export function PresetCard(props: PresetEntryProps): ReactNode {
  const { preset, overlay } = props;
  const tags = overlay?.tags ?? [];
  return (
    <Card interactive>
      <div className="tai-stack tai-stack-2">
        <div>
          <PresetName {...props} />
        </div>
        <span style={{ ...mutedStyle, fontFamily: 'var(--tai-font-mono)' }}>
          {preset.base_tool}
        </span>
        {preset.description ? <span>{preset.description}</span> : null}
        {tags.length > 0 ? <TagChips tags={tags} /> : null}
      </div>
    </Card>
  );
}
