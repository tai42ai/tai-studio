/**
 * Full-height page mode: a page declares "I fill the viewport" and the shell
 * gives its wrapper a viewport-height flex chain instead of the default
 * content-sized, scrolling `.tai-page`.
 *
 * The signal travels page → shell through context, NOT a route handle: plugin
 * pages all share ONE catch-all route, so a per-route handle cannot vary between
 * them. A rendered page (feature route or plugin page alike) opts in with
 * {@link useFillViewport}; the shell reads {@link usePageFillActive} to add the
 * `.tai-page--fill` / `.tai-shell-main--fill` modifiers. Opt-in is ref-counted so
 * the modifier survives a route transition (old page unmounts after the new one
 * mounts) and clears exactly when the last fill page leaves.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** The registrar a fill page acquires against; each acquire returns its own
 * one-shot release, so double-release is inert. */
interface PageFillRegistry {
  readonly acquire: () => () => void;
}

const PageFillRegistryContext = createContext<PageFillRegistry | null>(null);
const PageFillActiveContext = createContext(false);

/**
 * Wraps the shell's routed region: holds the count of pages asking for fill mode
 * and publishes both the registrar (for {@link useFillViewport}) and the active
 * flag (for {@link usePageFillActive}). Renders no DOM of its own.
 */
export function PageFillProvider({ children }: { children: ReactNode }): ReactNode {
  const [fillCount, setFillCount] = useState(0);
  const registry = useMemo<PageFillRegistry>(
    () => ({
      acquire() {
        setFillCount((count) => count + 1);
        let released = false;
        return () => {
          if (released) return;
          released = true;
          setFillCount((count) => count - 1);
        };
      },
    }),
    [],
  );
  return (
    <PageFillRegistryContext.Provider value={registry}>
      <PageFillActiveContext.Provider value={fillCount > 0}>
        {children}
      </PageFillActiveContext.Provider>
    </PageFillRegistryContext.Provider>
  );
}

/**
 * Opt the current page into full-height fill mode for as long as it is mounted.
 * The shell fills `<main>` to the viewport and lets the page's own root flex or
 * `height: 100%` down the chain. Must be called under a {@link PageFillProvider}
 * (the shell mounts one); outside it there is no wrapper to modify, so it throws
 * rather than silently do nothing.
 */
export function useFillViewport(): void {
  const registry = useContext(PageFillRegistryContext);
  if (registry === null) {
    throw new Error(
      'useFillViewport must be used within a <PageFillProvider> (the shell provides it)',
    );
  }
  useEffect(() => registry.acquire(), [registry]);
}

/** Whether any mounted page currently asks for fill mode — the shell's cue to add
 * the fill modifiers to `<main>` and the page wrapper. */
export function usePageFillActive(): boolean {
  return useContext(PageFillActiveContext);
}
