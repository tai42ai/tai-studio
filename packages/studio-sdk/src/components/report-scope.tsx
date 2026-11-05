/**
 * The tail of a report heading that names the write the report covers: `<heading> — <scope>`.
 */
import type { ReactNode } from 'react';

export function ReportScope({ scope }: { readonly scope: string }): ReactNode {
  return (
    <>
      {' — '}
      <span className="tai-mono">{scope}</span>
    </>
  );
}
