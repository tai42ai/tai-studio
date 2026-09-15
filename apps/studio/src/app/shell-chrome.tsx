/**
 * The shell's chrome pieces around the nav: the brand link, the three-state theme
 * control, the sign-out button, the routed content column, and the guarded-chrome-link
 * click handler for targets outside the route-token map.
 */
import {
  Button,
  MonitorIcon,
  MoonIcon,
  RadioGroup,
  SignOutIcon,
  SunIcon,
  type ThemePreference,
  useNavigationGate,
  usePageFillActive,
  useTheme,
} from '@tai42/studio-sdk';
import { Link, Outlet, useRouter } from '@tanstack/react-router';
import { type MouseEvent, type ReactNode, useCallback } from 'react';

import { IntegrityBanner } from './integrity';
import { RouteCapabilityBoundary } from './route-capability-boundary';

/**
 * Click handler for a chrome link whose target lies outside the route-token map.
 * The router's own `Link` commits a pushState the guard registry never sees, so an
 * armed unsaved-changes guard must be consulted here before the transition — plain
 * modified clicks (new tab/window) are left to the browser.
 */
export function useGuardedChromeLink(href: string): (event: MouseEvent<HTMLAnchorElement>) => void {
  const gate = useNavigationGate();
  const router = useRouter();
  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      void gate(href).then((allowed) => {
        if (!allowed) return;
        void router.navigate({ to: href });
      });
    },
    [gate, router, href],
  );
}

/** The brand row: the theme-matched mark plus the wordmark, linking home. The mark
 * is decorative; the label hides in the 72 px rail, so the link carries an explicit
 * accessible name that survives that collapse. */
export function Brand(): ReactNode {
  const { theme } = useTheme();
  const onGuardedClick = useGuardedChromeLink('/');
  const src = theme === 'dark' ? '/tai42-logo-icon-dark.png' : '/tai42-logo-icon.png';
  return (
    <Link to="/" className="tai-brand" aria-label="TAI42 Studio home" onClick={onGuardedClick}>
      <img className="tai-brand-mark" src={src} alt="" width={24} height={24} />
      <span className="tai-brand-label">TAI42 Studio</span>
    </Link>
  );
}

/** The three-state theme control: a segmented radiogroup of light / dark / system,
 * each an icon with a visually-hidden text name. Vertical in the 72 px rail (a
 * horizontal trio does not fit); horizontal elsewhere. */
export function ThemeControl({
  orientation,
}: {
  orientation: 'horizontal' | 'vertical';
}): ReactNode {
  const { preference, setPreference } = useTheme();
  return (
    <RadioGroup
      aria-label="Theme"
      variant="segmented"
      orientation={orientation}
      value={preference}
      onValueChange={(value) => {
        setPreference(value as ThemePreference);
      }}
      options={[
        { value: 'light', label: 'Light', icon: <SunIcon />, visuallyHiddenLabel: true },
        { value: 'dark', label: 'Dark', icon: <MoonIcon />, visuallyHiddenLabel: true },
        { value: 'system', label: 'System', icon: <MonitorIcon />, visuallyHiddenLabel: true },
      ]}
    />
  );
}

/** Sign-out. Icon-only in the 72 px rail (a labelled button does not fit), icon +
 * label everywhere else. The accessible name is always "Sign out". */
export function SignOutButton({
  compact,
  onSignOut,
}: {
  compact: boolean;
  onSignOut: () => void;
}): ReactNode {
  if (compact) {
    return (
      <button type="button" className="tai-icon-btn" aria-label="Sign out" onClick={onSignOut}>
        <SignOutIcon />
      </button>
    );
  }
  return (
    <Button variant="ghost" onClick={onSignOut}>
      <SignOutIcon />
      Sign out
    </Button>
  );
}

/**
 * The routed content column. Reads {@link usePageFillActive} so a page that opted
 * into fill mode gets the viewport-height flex chain (`--fill` modifiers) while
 * every scrolling page keeps the default content-sized `.tai-page`. Lives under
 * the shell's `PageFillProvider` so the opt-in a page raises from inside the
 * `<Outlet/>` reaches these class names.
 */
export function ShellMain({ integrityEnforced }: { integrityEnforced: boolean }): ReactNode {
  const fill = usePageFillActive();
  return (
    <main
      id="main-content"
      className={fill ? 'tai-shell-main tai-shell-main--fill' : 'tai-shell-main'}
      tabIndex={-1}
    >
      <div className={fill ? 'tai-page tai-page--fill' : 'tai-page'}>
        {integrityEnforced ? null : <IntegrityBanner />}
        <RouteCapabilityBoundary>
          <Outlet />
        </RouteCapabilityBoundary>
      </div>
    </main>
  );
}
