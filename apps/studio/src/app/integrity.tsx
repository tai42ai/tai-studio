/**
 * Import-map `integrity` support honesty. The byte-integrity of every
 * served Studio-plugin bundle is enforced by the browser ONLY where import-map
 * `integrity` is supported (Chrome 127+ / Firefox 138+ / Safari 18.4+); older
 * browsers ignore the entries and load unchecked. When enforcement is absent the
 * shell shows a LOUD, non-blocking warning banner rather than silently pretending
 * every byte is pinned.
 *
 * There is no dedicated platform flag for "import-map integrity is enforced", so
 * this is a capability probe: import-map `integrity` shipped together with — or
 * strictly after — `HTMLScriptElement.supports('importmap')` on every baseline
 * browser, so a browser that cannot report import-map support definitionally
 * cannot enforce integrity. The probe is injectable so the unit test can drive the
 * unsupported path.
 */
import type { ReactNode } from 'react';
import { ErrorState } from '@tai42/studio-sdk';

interface ScriptSupport {
  supports?: (type: string) => boolean;
}

/**
 * True when the running browser enforces import-map `integrity`. Defaults to
 * probing the real `HTMLScriptElement`; tests pass a stub to force either path.
 */
export function importMapIntegrityEnforced(
  scriptCtor: ScriptSupport | undefined = typeof HTMLScriptElement === 'undefined'
    ? undefined
    : HTMLScriptElement,
): boolean {
  const supports = scriptCtor?.supports;
  if (typeof supports !== 'function') return false;
  try {
    return supports.call(scriptCtor, 'importmap');
  } catch {
    return false;
  }
}

/** The loud, non-blocking banner shown when integrity is not enforced. */
export function IntegrityBanner(): ReactNode {
  return (
    <div data-testid="integrity-banner" style={{ padding: 'var(--tai-space-3)' }}>
      <ErrorState message="Studio-plugin byte-integrity not enforced by this browser: served plugin bundles are not byte-verified against their manifest hashes. Update to a current Chrome, Firefox, or Safari for full protection." />
    </div>
  );
}
