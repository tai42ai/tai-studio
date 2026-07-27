/**
 * Semantic table primitives — thin wrappers over the native table elements.
 * They keep the real `table`/`row`/`columnheader`/`cell` roles so assistive
 * tech and tests read a proper table. Only the root carries a class: the header
 * and cell rules in the stylesheet are descendants of `.tai-table`, so a cell
 * cannot drift out of the system by forgetting one.
 *
 * A numeric column opts in with `numeric`, which stamps `data-numeric="true"` —
 * the hook the stylesheet right-aligns on tabular figures so digits line up.
 *
 * Each wrapper FORWARDS a consumer `ref` to the native element it renders — the
 * attribute spread carries it, the same way it carries every other native prop —
 * so a caller that has to measure or scroll a cell is not forced back to a raw
 * `<td>` and out of the system.
 */
import type { HTMLAttributes, Ref, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  readonly children?: ReactNode;
  /** A consumer ref for the `<table>` itself. */
  readonly ref?: Ref<HTMLTableElement>;
}

export function Table({ children, className, ...props }: TableProps) {
  return (
    <table {...props} className={className === undefined ? 'tai-table' : `tai-table ${className}`}>
      {children}
    </table>
  );
}

/** `<thead>` and `<tbody>` take the same surface: the native one. */
export interface TableSectionProps extends HTMLAttributes<HTMLTableSectionElement> {
  readonly children?: ReactNode;
  /** A consumer ref for the section element itself. */
  readonly ref?: Ref<HTMLTableSectionElement>;
}

export function THead({ children, ...props }: TableSectionProps) {
  return <thead {...props}>{children}</thead>;
}

export function TBody({ children, ...props }: TableSectionProps) {
  return <tbody {...props}>{children}</tbody>;
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  readonly children?: ReactNode;
  /** A consumer ref for the `<tr>` itself. */
  readonly ref?: Ref<HTMLTableRowElement>;
}

export function TR({ children, ...props }: TableRowProps) {
  return <tr {...props}>{children}</tr>;
}

/** Right-align a column of digits on tabular figures. */
export interface NumericColumnProps {
  readonly numeric?: boolean;
}

/**
 * A header cell. `scope` defaults to `col` because that is what a `<th>` in the
 * header row IS, and without it nothing associates the cell with the column
 * below it: a screen reader announcing a data cell has no header to name it.
 * A row header — the leading cell of a body row — passes `scope="row"`.
 */
export interface THProps extends ThHTMLAttributes<HTMLTableCellElement>, NumericColumnProps {
  readonly children?: ReactNode;
  /** A consumer ref for the `<th>` itself. */
  readonly ref?: Ref<HTMLTableCellElement>;
}

export function TH({ children, numeric = false, scope = 'col', ...props }: THProps) {
  return (
    <th {...props} scope={scope} data-numeric={numeric ? 'true' : undefined}>
      {children}
    </th>
  );
}

export interface TDProps extends TdHTMLAttributes<HTMLTableCellElement>, NumericColumnProps {
  readonly children?: ReactNode;
  /** A consumer ref for the `<td>` itself. */
  readonly ref?: Ref<HTMLTableCellElement>;
}

export function TD({ children, numeric = false, ...props }: TDProps) {
  return (
    <td {...props} data-numeric={numeric ? 'true' : undefined}>
      {children}
    </td>
  );
}
