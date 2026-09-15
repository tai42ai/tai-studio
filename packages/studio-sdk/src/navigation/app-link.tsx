/**
 * `AppLink` — the SDK's route-token anchor: a real `<a>` whose plain left-click is
 * intercepted for a client-side transition.
 */
import {
  type AriaAttributes,
  createElement,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useCallback,
} from 'react';

import { useNavigation } from './context';
import type { RouteSearch, RouteToken } from './types';

export interface AppLinkProps<T extends RouteToken> {
  to: T;
  search?: RouteSearch<T>;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  'aria-current'?: AriaAttributes['aria-current'];
  /** Native tooltip text (also a sensible non-AT hover hint). */
  title?: string;
  /** Inline styles for the anchor. */
  style?: CSSProperties;
}

/**
 * A real anchor (so middle-click / open-in-new-tab keep working) that drives a
 * client-side transition on plain left-click. Modified clicks (new tab/window,
 * download) fall through to the browser's default handling.
 */
export function AppLink<T extends RouteToken>({
  to,
  search,
  children,
  className,
  'aria-label': ariaLabel,
  'aria-current': ariaCurrent,
  title,
  style,
}: AppLinkProps<T>): ReactNode {
  const { navigate, resolvePath } = useNavigation();
  const href = resolvePath(to, search);
  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      navigate(to, search);
    },
    [navigate, to, search],
  );
  return createElement(
    'a',
    {
      href,
      className,
      'aria-label': ariaLabel,
      'aria-current': ariaCurrent,
      title,
      style,
      onClick,
    },
    children,
  );
}
