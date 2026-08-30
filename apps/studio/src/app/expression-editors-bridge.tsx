/**
 * The host-side half of the expression-editor extension point. The contribution
 * registry lives in the host-only `@tai42/studio-sdk/host` singleton — the plugin
 * surface cannot read it — so the SHELL is what bridges the committed editors into
 * a React context the plugin surface CAN consume. This component reads
 * `getContributions().expressionEditors` through {@link usePluginContributions}
 * (so it re-renders as the load pass commits) and mounts `ExpressionEditorsProvider`
 * with it.
 *
 * It sits above the whole routed tree, so the context reaches BOTH host feature
 * pages (the shell's own `ExpressionField` sites) and plugin pages — React is the
 * import-map singleton every bundle shares, so one provider serves them all. Before
 * the pass is `ready` the map is empty, so an `ExpressionField` simply renders a
 * plain text field until an editor commits — the same graceful absence a field
 * gets when no editor is contributed at all.
 */
import type { ReactNode } from 'react';
import { ExpressionEditorsProvider } from '@tai42/studio-sdk';
import { usePluginContributions } from '@tai42/studio-sdk/host';

export function ExpressionEditorsBridge({ children }: { children: ReactNode }): ReactNode {
  const { contributions } = usePluginContributions();
  return (
    <ExpressionEditorsProvider editors={contributions.expressionEditors}>
      {children}
    </ExpressionEditorsProvider>
  );
}
