import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Table, TBody, TD, TH, THead, TR } from './table';

describe('Table primitives', () => {
  it('render a semantic table with proper roles', () => {
    render(
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Kind</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD>echo</TD>
            <TD>builtin</TD>
          </TR>
        </TBody>
      </Table>,
    );

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();

    expect(screen.getAllByRole('row')).toHaveLength(2); // header row + body row

    // The `cell` role covers only <td> data cells (headers are `columnheader`).
    const bodyCells = screen.getAllByRole('cell');
    expect(bodyCells).toHaveLength(2);
    expect(bodyCells[0]).toHaveTextContent('echo');
    expect(bodyCells[1]).toHaveTextContent('builtin');
  });
});
