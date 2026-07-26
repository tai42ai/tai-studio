/**
 * Semantic table primitives — thin wrappers over the native table elements.
 * They keep the real `table`/`row`/`columnheader`/`cell` roles so assistive
 * tech and tests read a proper table. Only the root carries a class: the header
 * and cell rules in the stylesheet are descendants of `.tai-table`, so a cell
 * cannot drift out of the system by forgetting one.
 *
 * A numeric column opts in with `numeric`, which stamps `data-numeric="true"` —
 * the hook the stylesheet right-aligns on tabular figures so digits line up.
 */
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function Table({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLTableElement> & { children?: ReactNode }) {
  return (
    <table {...props} className={className === undefined ? 'tai-table' : `tai-table ${className}`}>
      {children}
    </table>
  );
}

export function THead({
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement> & { children?: ReactNode }) {
  return <thead {...props}>{children}</thead>;
}

export function TBody({
  children,
  ...props
}: HTMLAttributes<HTMLTableSectionElement> & { children?: ReactNode }) {
  return <tbody {...props}>{children}</tbody>;
}

export function TR({
  children,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { children?: ReactNode }) {
  return <tr {...props}>{children}</tr>;
}

/** Right-align a column of digits on tabular figures. */
interface NumericColumnProps {
  readonly numeric?: boolean;
}

export function TH({
  children,
  numeric = false,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & NumericColumnProps & { children?: ReactNode }) {
  return (
    <th {...props} data-numeric={numeric ? 'true' : undefined}>
      {children}
    </th>
  );
}

export function TD({
  children,
  numeric = false,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & NumericColumnProps & { children?: ReactNode }) {
  return (
    <td {...props} data-numeric={numeric ? 'true' : undefined}>
      {children}
    </td>
  );
}
