/**
 * Unsaved-changes guard for editors that get torn down or navigated away from. One
 * registry closes the gap: editors report dirtiness via {@link useRegisterDirty}; the
 * enclosing {@link DirtyGuardBoundary} arms {@link useNavigationGuard} from that
 * registry, so a route navigation confirms through a shared dialog and a full-page
 * unload raises the native prompt. {@link GuardedTabs} adds a tab-switch confirm on
 * top of the same boundary — `Tabs` unmount inactive panels, so a switch away from a
 * dirty editor is held behind the confirm too. The dialog is one shared
 * {@link ConfirmDialog} driven by a pending-promise resolver, so the guard's
 * `Promise<boolean>` handler and the tab switch both settle against it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ConfirmDialog } from './confirm-dialog';
import { Tabs } from './tabs';
import type { TabItem } from './tabs';
import { useNavigationGuard } from '../navigation';

interface DirtyGuardValue {
  /** Register (or clear) one editor's dirty state, keyed by a stable id. */
  readonly setDirty: (id: string, dirty: boolean) => void;
  /**
   * Resolve `true` when it is safe to leave (nothing dirty, or the operator
   * confirmed the discard); `false` to stay put.
   */
  readonly confirmLeaveIfDirty: () => Promise<boolean>;
}

const DirtyGuardContext = createContext<DirtyGuardValue | null>(null);

/**
 * Boundary that guards navigation away from a region holding a dirty editor. Editors
 * inside it arm the guard through {@link useRegisterDirty}; while any is dirty a route
 * navigation (a route-token/plugin navigate, an {@link AppLink}, or a browser
 * back/forward) confirms through the shared discard dialog, and a full-page unload
 * raises the native prompt. Use this directly to guard a dirty editor that is a plain
 * page section (no tabs); {@link GuardedTabs} wraps this same boundary to additionally
 * guard tab switches.
 */
export function DirtyGuardBoundary({ children }: { readonly children: ReactNode }): ReactNode {
  const dirtyIds = useRef<Set<string>>(new Set());
  // Mirror the registry's non-empty state into React so the navigation guard's
  // `when` re-arms as editors go dirty/clean.
  const [anyDirty, setAnyDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const setDirty = useCallback((id: string, dirty: boolean): void => {
    if (dirty) dirtyIds.current.add(id);
    else dirtyIds.current.delete(id);
    setAnyDirty(dirtyIds.current.size > 0);
  }, []);

  const confirmLeaveIfDirty = useCallback((): Promise<boolean> => {
    if (dirtyIds.current.size === 0) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      // Settle a still-pending confirm as "stay" before it is orphaned by the new one.
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const settle = useCallback((ok: boolean): void => {
    setOpen(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(ok);
  }, []);

  // The route navigation guard is armed from the SAME registry, so it confirms
  // through this dialog and any armed guard raises the native unload prompt.
  useNavigationGuard(anyDirty, confirmLeaveIfDirty);

  return (
    <DirtyGuardContext.Provider value={{ setDirty, confirmLeaveIfDirty }}>
      {children}
      {open ? (
        <ConfirmDialog
          title="Discard unsaved changes?"
          confirmLabel="Discard changes"
          pendingLabel="Discarding"
          confirmVariant="danger"
          isPending={false}
          onConfirm={() => {
            settle(true);
          }}
          onClose={() => {
            settle(false);
          }}
        >
          <p style={{ margin: 0 }}>This editor has unsaved changes. Leaving now discards them.</p>
        </ConfirmDialog>
      ) : null}
    </DirtyGuardContext.Provider>
  );
}

/**
 * Report an editor's dirty state to the enclosing {@link DirtyGuardBoundary} (which
 * {@link GuardedTabs} also provides). A no-op outside a boundary (an editor rendered
 * standalone, e.g. in isolation tests) so the hook is always safe to call.
 */
export function useRegisterDirty(dirty: boolean): void {
  const ctx = useContext(DirtyGuardContext);
  const id = useId();
  useEffect(() => {
    ctx?.setDirty(id, dirty);
  }, [ctx, id, dirty]);
  // Clear the registration on unmount (a tab switch unmounts the editor) so a
  // torn-down editor never leaves the guard armed.
  useEffect(() => () => ctx?.setDirty(id, false), [ctx, id]);
}

function GuardedTabsInner({
  items,
  defaultValue,
}: {
  readonly items: readonly TabItem[];
  readonly defaultValue?: string;
}): ReactNode {
  const ctx = useContext(DirtyGuardContext);
  const [active, setActive] = useState<string | undefined>(defaultValue ?? items[0]?.value);
  // The tab set is dynamic (plugin/capability-gated tabs). If the active value is
  // no longer present, fall back to the first tab rather than render no panel.
  const effective = items.some((item) => item.value === active) ? active : items[0]?.value;

  const onValueChange = (next: string): void => {
    void ctx?.confirmLeaveIfDirty().then((ok) => {
      if (ok) setActive(next);
    });
  };

  return <Tabs items={items} value={effective} onValueChange={onValueChange} />;
}

/**
 * A drop-in replacement for {@link Tabs} that guards a switch away from a dirty
 * editor. Wraps the tabs in a {@link DirtyGuardBoundary}, so an editor rendered in
 * any panel can arm the guard through {@link useRegisterDirty}.
 */
export function GuardedTabs({
  items,
  defaultValue,
}: {
  readonly items: readonly TabItem[];
  readonly defaultValue?: string;
}): ReactNode {
  return (
    <DirtyGuardBoundary>
      <GuardedTabsInner items={items} defaultValue={defaultValue} />
    </DirtyGuardBoundary>
  );
}
