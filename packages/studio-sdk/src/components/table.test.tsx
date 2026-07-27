import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { Table, TBody, TD, TH, THead, TR } from './table';
import type {
  NumericColumnProps,
  TableProps,
  TableRowProps,
  TableSectionProps,
  TDProps,
  THProps,
} from '../index';

/**
 * PUBLISHED-TYPE GATE, enforced by `pnpm typecheck` (`tsc --noEmit` covers every
 * file under `src`, tests included).
 *
 * Every one of these six components is re-exported from the package entry, so a
 * plugin author writes against them — and a component whose props exist only as
 * an inline literal cannot be named, extended, or wrapped without retyping it by
 * hand. The types are imported from `../index`, the published entry, so dropping
 * a re-export fails this gate too.
 */
interface PluginTableProps extends TableProps {
  readonly density: 'compact' | 'comfortable';
}
interface PluginTableSectionProps extends TableSectionProps {
  readonly sticky?: boolean;
}
interface PluginTableRowProps extends TableRowProps {
  readonly selected?: boolean;
}
interface PluginTHProps extends THProps {
  readonly sortable?: boolean;
}
interface PluginTDProps extends TDProps {
  readonly truncate?: boolean;
}
const numericIsPublished: NumericColumnProps = { numeric: true };

describe('Table primitives', () => {
  it('publishes a nameable props type for every one of its six components', () => {
    const table: PluginTableProps = { density: 'compact' };
    const section: PluginTableSectionProps = { sticky: true };
    const row: PluginTableRowProps = { selected: true };
    const th: PluginTHProps = { sortable: true, numeric: true };
    const td: PluginTDProps = { truncate: true, numeric: false };
    expect([table.density, section.sticky, row.selected, th.numeric, td.numeric]).toEqual([
      'compact',
      true,
      true,
      true,
      false,
    ]);
    expect(numericIsPublished.numeric).toBe(true);
  });

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
    expect(table).toHaveClass('tai-table');
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();

    expect(screen.getAllByRole('row')).toHaveLength(2); // header row + body row

    // The `cell` role covers only <td> data cells (headers are `columnheader`).
    const bodyCells = screen.getAllByRole('cell');
    expect(bodyCells).toHaveLength(2);
    expect(bodyCells[0]).toHaveTextContent('echo');
    expect(bodyCells[1]).toHaveTextContent('builtin');
  });

  it('associates every header cell with what it heads, column by default', () => {
    render(
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH numeric>Calls</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TH scope="row">echo</TH>
            <TD numeric>1204</TD>
          </TR>
        </TBody>
      </Table>,
    );

    // Without a scope nothing ties a header to the cells under it, and a screen
    // reader announcing a data cell has no header to name it with.
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('scope', 'col');
    expect(screen.getByRole('columnheader', { name: 'Calls' })).toHaveAttribute('scope', 'col');
    // The leading cell of a body row heads the row, and says so.
    expect(screen.getByRole('rowheader', { name: 'echo' })).toHaveAttribute('scope', 'row');
  });

  it('marks a numeric column on both the header and the cell', () => {
    render(
      <Table className="tai-mono">
        <THead>
          <TR>
            <TH>Name</TH>
            <TH numeric>Calls</TH>
          </TR>
        </THead>
        <TBody>
          <TR>
            <TD>echo</TD>
            <TD numeric>1204</TD>
          </TR>
        </TBody>
      </Table>,
    );

    expect(screen.getByRole('table')).toHaveAttribute('class', 'tai-table tai-mono');
    expect(screen.getByRole('columnheader', { name: 'Calls' })).toHaveAttribute(
      'data-numeric',
      'true',
    );
    expect(screen.getByRole('columnheader', { name: 'Name' })).not.toHaveAttribute('data-numeric');
    expect(screen.getByRole('cell', { name: '1204' })).toHaveAttribute('data-numeric', 'true');
    expect(screen.getByRole('cell', { name: 'echo' })).not.toHaveAttribute('data-numeric');
  });

  it('forwards a consumer ref to each native element it wraps', () => {
    // A ref a wrapper accepts and drops is worse than one it refuses: React 19
    // warns about neither, so a consumer's measurement silently reads null.
    const table = createRef<HTMLTableElement>();
    const head = createRef<HTMLTableSectionElement>();
    const body = createRef<HTMLTableSectionElement>();
    const row = createRef<HTMLTableRowElement>();
    const header = createRef<HTMLTableCellElement>();
    const cell = createRef<HTMLTableCellElement>();

    render(
      <Table ref={table}>
        <THead ref={head}>
          <TR>
            <TH ref={header}>Name</TH>
          </TR>
        </THead>
        <TBody ref={body}>
          <TR ref={row}>
            <TD ref={cell}>echo</TD>
          </TR>
        </TBody>
      </Table>,
    );

    expect(table.current?.tagName).toBe('TABLE');
    expect(head.current?.tagName).toBe('THEAD');
    expect(body.current?.tagName).toBe('TBODY');
    expect(row.current?.tagName).toBe('TR');
    expect(header.current?.tagName).toBe('TH');
    expect(cell.current?.tagName).toBe('TD');
  });
});
