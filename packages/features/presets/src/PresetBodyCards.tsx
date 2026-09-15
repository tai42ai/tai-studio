/**
 * The preset's baked-body cards: the active version's `fixed_kwargs` and, when set,
 * its `output_schema`, each rendered read-only via `JsonTree`.
 *
 * `fixed_kwargs` can carry credentials: it is rendered on this authed surface but
 * NEVER logged or toasted.
 */
import type { PresetDetail } from '@tai42/api-client';
import { Card, JsonTree } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

export function PresetBodyCards({ preset }: { readonly preset: PresetDetail }): ReactNode {
  return (
    <>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Fixed kwargs</h3>
        <Card>
          <JsonTree data={preset.fixed_kwargs} label="Fixed kwargs" />
        </Card>
      </section>

      {preset.output_schema !== null ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Output schema</h3>
          <Card>
            <JsonTree data={preset.output_schema} label="Output schema" />
          </Card>
        </section>
      ) : null}
    </>
  );
}
