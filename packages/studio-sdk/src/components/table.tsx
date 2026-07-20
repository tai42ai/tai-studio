/**
 * Semantic table primitives — thin token-styled wrappers over the native table
 * elements. They keep the real `table`/`row`/`columnheader`/`cell` roles so
 * assistive tech and tests read a proper table.
 */
import type {
  CSSProperties,
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
};

const cellStyle: CSSProperties = {
  textAlign: 'left',
  padding: 'var(--tai-space-2) var(--tai-space-3)',
  borderBottom: '1px solid var(--tai-color-border)',
};

const headStyle: CSSProperties = {
  ...cellStyle,
  fontWeight: 600,
  color: 'var(--tai-color-text-muted)',
};

export function Table({
  children,
  style,
  ...props
}: HTMLAttributes<HTMLTableElement> & { children?: ReactNode }) {
  return (
    <table {...props} style={{ ...tableStyle, ...style }}>
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

export function TH({
  children,
  style,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th {...props} style={{ ...headStyle, ...style }}>
      {children}
    </th>
  );
}

export function TD({
  children,
  style,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td {...props} style={{ ...cellStyle, ...style }}>
      {children}
    </td>
  );
}
