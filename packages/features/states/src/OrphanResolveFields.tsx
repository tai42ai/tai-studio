/**
 * The reconcile-resolve view shown when a declarations edit would orphan open records:
 * a table of the orphaned records and a resolution field the operator fills to close
 * them. Rendered only after the server's 422 reveals the orphans.
 */
import { Field, Table, TBody, TD, TextInput, TH, THead, TR } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { OrphanRecord } from './reconcileOrphans';

export interface OrphanResolveFieldsProps {
  readonly orphans: readonly OrphanRecord[];
  readonly resolution: string;
  readonly onResolutionChange: (value: string) => void;
}

export function OrphanResolveFields({
  orphans,
  resolution,
  onResolutionChange,
}: OrphanResolveFieldsProps): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}>
        <h4 style={{ margin: 0, fontSize: 'var(--tai-text-sm)' }}>Open records to close</h4>
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <THead>
              <TR>
                <TH>Subject</TH>
                <TH>Kind</TH>
                <TH>Item</TH>
              </TR>
            </THead>
            <TBody>
              {orphans.map((orphan) => (
                <TR key={`${orphan.subject}:${orphan.kind}:${orphan.id ?? ''}`}>
                  <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{orphan.subject}</TD>
                  <TD>{orphan.kind}</TD>
                  <TD>{orphan.label ?? orphan.id ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </section>
      <Field
        label="Resolution"
        description="The reconcile resolution to close the orphaned records with."
      >
        <TextInput
          value={resolution}
          placeholder="A resolution the template's reconcile accepts"
          onChange={(event) => {
            onResolutionChange(event.target.value);
          }}
        />
      </Field>
    </div>
  );
}
