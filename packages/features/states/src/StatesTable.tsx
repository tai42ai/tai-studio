/** The states master table: header columns (trimmed in split mode) and one row per state. */
import type { StateListItem } from '@tai42/api-client';
import { ScrollRegion, Table, TBody, TH, THead, TR } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { StateRow } from './StateRow';

export interface StatesTableProps {
  readonly states: readonly StateListItem[];
  readonly selected: string | undefined;
  readonly compact: boolean;
}

export function StatesTable({ states, selected, compact }: StatesTableProps): ReactNode {
  return (
    <ScrollRegion label="States">
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Subject kinds</TH>
            {compact ? null : (
              <>
                <TH>Records</TH>
                <TH>Templates</TH>
                <TH>Consumers</TH>
                <TH>Updated</TH>
              </>
            )}
          </TR>
        </THead>
        <TBody>
          {states.map((state) => (
            <StateRow
              key={state.name}
              state={state}
              selected={state.name === selected}
              compact={compact}
            />
          ))}
        </TBody>
      </Table>
    </ScrollRegion>
  );
}
