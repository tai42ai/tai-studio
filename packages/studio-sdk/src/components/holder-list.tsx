/**
 * `HolderList` — the things that still use a name, each a link to where it lives.
 * A core holder kind links to its Studio screen; a plugin kind links to the page its
 * plugin registered for it; a kind nobody resolves, and a count of holders the caller's
 * role cannot read, show as text, so no holder is hidden.
 */
import type { ReferenceHolder } from '@tai42/api-client';
import { type MouseEvent, type ReactNode, useCallback } from 'react';

import { errorMessage } from '../errors';
import { useNavigation } from '../navigation/context';
import { coreHolderRoute, isCountHolder } from './holder-kinds';
import { Spinner } from './primitives';
import { ScrollRegion } from './scroll-region';

/** Where one holder links: its `href` and the client-side transition to it. */
export interface HolderHref {
  readonly href: string;
  readonly navigate: () => void;
}

/**
 * The resolver for holder links: `null` for a count holder and for a kind neither the
 * core table nor any registered plugin resolves.
 */
export function useHolderHref(): (holder: ReferenceHolder) => HolderHref | null {
  const { navigate, resolvePath, navigatePlugin, resolvePluginPath, resolveHolderLink } =
    useNavigation();
  return useCallback(
    (holder: ReferenceHolder): HolderHref | null => {
      if (isCountHolder(holder)) return null;
      const core = coreHolderRoute(holder);
      if (core !== null) {
        return {
          href: resolvePath(core.token, core.search),
          navigate: () => {
            navigate(core.token, core.search);
          },
        };
      }
      const target = resolveHolderLink?.(holder) ?? null;
      if (target === null) return null;
      const { pluginId, pagePath, params, search } = target;
      return {
        href: resolvePluginPath(pluginId, pagePath, params, search),
        navigate: () => {
          navigatePlugin(pluginId, pagePath, params, search);
        },
      };
    },
    [navigate, resolvePath, navigatePlugin, resolvePluginPath, resolveHolderLink],
  );
}

export interface HolderListProps {
  readonly holders: readonly ReferenceHolder[];
  /** The list's accessible name, e.g. `Holders of <name>`. */
  readonly label: string;
  /** The line above the list saying what to do about the holders. */
  readonly lead: string;
  /** Called before a holder link navigates (a dialog closes itself here). */
  readonly onNavigate?: () => void;
}

function HolderLink({
  link,
  onNavigate,
  children,
}: {
  link: HolderHref;
  onNavigate: (() => void) | undefined;
  children: ReactNode;
}): ReactNode {
  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      onNavigate?.();
      link.navigate();
    },
    [link, onNavigate],
  );
  return (
    <a className="tai-link" href={link.href} onClick={onClick}>
      {children}
    </a>
  );
}

/** The lead line, then one list item per holder: a link where one resolves, else text. */
export function HolderList({ holders, label, lead, onNavigate }: HolderListProps): ReactNode {
  const hrefOf = useHolderHref();
  return (
    <div>
      <p className="tai-holder-lead">{lead}</p>
      <ScrollRegion label={label} axis="vertical" className="tai-holder-list">
        <ul aria-label={label}>
          {holders.map((holder, index) => {
            const link = hrefOf(holder);
            return (
              <li key={`${holder.kind}\u0000${holder.name}\u0000${String(index)}`}>
                {link === null ? (
                  holder.summary
                ) : (
                  <HolderLink link={link} onNavigate={onNavigate}>
                    {holder.summary}
                  </HolderLink>
                )}
              </li>
            );
          })}
        </ul>
      </ScrollRegion>
    </div>
  );
}

/**
 * What a dialog knows about the holders of a name before it acts: still reading, the
 * caller has no grant for the read, the read failed, or the holders it read (or the
 * holders a refusal named).
 */
export type HolderPreviewState =
  | { readonly status: 'loading' }
  | { readonly status: 'no-grant'; readonly message: string }
  | { readonly status: 'error'; readonly error: unknown }
  | { readonly status: 'ready'; readonly holders: readonly ReferenceHolder[] };

export interface HolderPreviewProps extends Omit<HolderListProps, 'holders'> {
  readonly state: HolderPreviewState;
}

/**
 * The holder region of a rename, delete or detach dialog. The preview is advisory:
 * loading, no grant and a failed read leave the dialog's action enabled, and the
 * server's refusal decides. An empty preview renders nothing.
 */
export function HolderPreview({ state, ...list }: HolderPreviewProps): ReactNode {
  switch (state.status) {
    case 'loading':
      return <Spinner label="Checking what still uses this" />;
    case 'no-grant':
      return (
        <p role="status" className="tai-muted" style={{ margin: 0 }}>
          {state.message}
        </p>
      );
    case 'error':
      return (
        <p role="status" className="tai-muted" style={{ margin: 0 }}>
          Could not check what uses this: {errorMessage(state.error)}
        </p>
      );
    case 'ready':
      return state.holders.length === 0 ? null : <HolderList holders={state.holders} {...list} />;
  }
}

/** The holders a preview state blocks on: a non-empty list disables the action. */
export function previewHolders(state: HolderPreviewState): readonly ReferenceHolder[] {
  return state.status === 'ready' ? state.holders : [];
}
