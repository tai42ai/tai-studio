/**
 * The preset detail record grid: base tool, overlay display name, description, active
 * version, overlay tags, and the extension-set count. The record does not carry the
 * display name or categorization tags — both come from the tool_meta overlay.
 */
import type { PresetDetail } from '@tai42/api-client';
import type { ReactNode } from 'react';

import { TagChips } from './tags';

export function PresetRecordFields({
  preset,
  overlayDisplayName,
  overlayTags,
}: {
  readonly preset: PresetDetail;
  readonly overlayDisplayName: string | null;
  readonly overlayTags: readonly string[];
}): ReactNode {
  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 'var(--tai-space-2) var(--tai-space-4)',
        margin: 0,
      }}
    >
      <dt style={{ color: 'var(--tai-color-text-muted)' }}>Base tool</dt>
      <dd style={{ margin: 0, fontFamily: 'var(--tai-font-mono)' }}>{preset.base_tool}</dd>
      <dt style={{ color: 'var(--tai-color-text-muted)' }}>Display name</dt>
      <dd style={{ margin: 0 }}>{overlayDisplayName ?? '—'}</dd>
      <dt style={{ color: 'var(--tai-color-text-muted)' }}>Description</dt>
      <dd style={{ margin: 0 }}>{preset.description || '—'}</dd>
      <dt style={{ color: 'var(--tai-color-text-muted)' }}>Active version</dt>
      <dd style={{ margin: 0 }}>{preset.active_version}</dd>
      <dt style={{ color: 'var(--tai-color-text-muted)' }}>Tags</dt>
      <dd style={{ margin: 0 }}>
        {overlayTags.length > 0 ? <TagChips tags={overlayTags} /> : '—'}
      </dd>
      <dt style={{ color: 'var(--tai-color-text-muted)' }}>Extension sets</dt>
      <dd style={{ margin: 0 }}>{preset.extensions.length}</dd>
    </dl>
  );
}
