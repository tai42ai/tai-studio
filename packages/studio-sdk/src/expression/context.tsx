/**
 * The consumption bridge for contributed expression editors: the SHELL reads the
 * committed contributions from `@tai42/studio-sdk/host` and mounts
 * {@link ExpressionEditorsProvider} high in the tree, so both host features and
 * plugin pages resolve an editor for a language through {@link useExpressionEditor}.
 *
 * WHY A CONTEXT AND NOT A DIRECT REGISTRY READ: the contribution registry lives in
 * the host-only `@tai42/studio-sdk/host` module, which the plugin surface
 * deliberately cannot import — a served plugin bundle must not be able to forge,
 * wipe, or ENUMERATE the registry. React itself is the one import-map singleton
 * both bundles share (the shell externalises `react` and `@tai42/studio-sdk`), so a
 * context provided by the host reaches a plugin page's render. The provider carries
 * the editors as a private context value the plugin surface never exports, and the
 * only door through it is {@link useExpressionEditor}, which resolves ONE language
 * to ONE contribution. A plugin can look up the editor for its own field and no
 * more: it cannot list the languages, count the editors, or mutate the set.
 *
 * ABSENT PROVIDER IS A FIRST-CLASS STATE: a field rendered with no provider above
 * it (a host that never wired the bridge, a test that mounts a field bare) resolves
 * `null` and degrades to a plain text field. That is the graceful-absence contract
 * {@link ExpressionField} relies on, so the hook returns `null` rather than throwing.
 */
import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';

import type { ExpressionEditorContribution, ExpressionLanguage } from './types';

/**
 * The provider's private value: a language → contribution lookup. Held as a
 * function, not the raw map, so even the context value hands a consumer nothing to
 * iterate — the sole operation is resolve-one-language. The context is module-local
 * and never exported, so a plugin bundle cannot read it directly either.
 */
type EditorLookup = (language: ExpressionLanguage) => ExpressionEditorContribution | null;

const ExpressionEditorsContext = createContext<EditorLookup | null>(null);

export interface ExpressionEditorsProviderProps {
  /**
   * The committed editor contributions, keyed by language — exactly the shell's
   * `getContributions().expressionEditors`. Passed as the read-only map it already
   * is; the provider never mutates or re-exposes it, and wraps it in a lookup so a
   * consumer can only resolve, never enumerate.
   */
  readonly editors: ReadonlyMap<string, ExpressionEditorContribution>;
  readonly children: ReactNode;
}

/**
 * Publishes the contributed editors to the subtree as a lookup. The shell mounts
 * this once, above both the host feature routes and the plugin pages, with the
 * host registry's `expressionEditors` map. Re-rendering with a new `editors` map
 * (the load pass completing) updates every consumer.
 */
export function ExpressionEditorsProvider({
  editors,
  children,
}: ExpressionEditorsProviderProps): ReactNode {
  // Memoised on the `editors` map so the context value keeps a STABLE identity
  // across re-renders that do not change the map — a new closure every render would
  // re-notify every consumer that reads the context (every mounted field) for
  // nothing. The identity turns over exactly when the map does (the load pass
  // committing a new editor), which is the one time consumers must re-resolve.
  const lookup = useMemo<EditorLookup>(
    () => (language) => editors.get(language) ?? null,
    [editors],
  );
  return createElement(ExpressionEditorsContext.Provider, { value: lookup }, children);
}

/**
 * Resolve the contributed editor for one expression language, or `null` when none
 * is registered OR no {@link ExpressionEditorsProvider} is mounted above the caller.
 * This is the ONLY way a plugin surface reaches a contributed editor: it cannot
 * enumerate or mutate the registry, only ask for one language. `null` is the
 * graceful-absence signal {@link ExpressionField} renders a plain text field on.
 */
export function useExpressionEditor(
  language: ExpressionLanguage,
): ExpressionEditorContribution | null {
  const lookup = useContext(ExpressionEditorsContext);
  if (lookup === null) return null;
  return lookup(language);
}
