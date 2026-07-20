/**
 * Presets page — a master/detail surface over the single-tier presets API. The
 * left pane is the presets table (`PresetsList`); selecting a row sets `?preset=`
 * (shell-owned routing via `AppLink`), which drives the right-pane detail
 * (`PresetDetail`: record, active baked kwargs, version history, save-version,
 * rollback, delete). Mirrors the tools page's `?tool=` master/detail shape.
 */
import type { ReactNode } from 'react';
import { Card, EmptyState, type PageProps } from '@tai42/studio-sdk';

import { PresetsList } from './PresetsList';
import { PresetDetail } from './PresetDetail';

export function PresetsPage({ search }: PageProps<'presets'>): ReactNode {
  const selected = search.preset;

  return (
    <div
      data-testid="presets-page"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}
    >
      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <h1 style={{ margin: 0, fontSize: 'var(--tai-text-xl)' }}>Presets</h1>
        <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
          Named, versioned tool presets — a base tool with fixed kwargs baked in.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(20rem, 28rem) 1fr',
          gap: 'var(--tai-space-6)',
          alignItems: 'start',
        }}
      >
        <PresetsList selected={selected} />

        <div>
          {selected !== undefined ? (
            <PresetDetail key={selected} name={selected} />
          ) : (
            <Card>
              <EmptyState
                title="No preset selected"
                description="Choose a preset from the list to view its versions and manage it."
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
