/**
 * Owned DS primitives, wearing the design-system classes from
 * `components.css`. These cover the shared UI states every feature drives from
 * TanStack Query: loading skeletons, a shared empty state, and a loud error
 * surface. Plugins consume these — never raw Tailwind utilities.
 *
 * `Button` is ONE implementation for both an action and a link. Given an `href`
 * it renders an anchor, and that href is checked against an http/https
 * allow-list: a relative reference stays in-app, an absolute http(s) URL opens
 * in a new tab with `rel="noopener noreferrer external"`, and any other scheme
 * (`javascript:`, `data:`, …) is NEUTRALIZED — rendered as plain text with no
 * href, so a hostile URL can never become a live navigation target. This is an
 * XSS pin.
 */
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

import { AlertTriangleIcon } from './icons';

// -- Link safety --------------------------------------------------------------

/** True only for an absolute `http:`/`https:` URL. Everything else is unsafe. */
export function isSafeHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

/**
 * A same-document, root-relative or explicitly relative reference. The negative
 * lookahead rejects a protocol-relative `//host` (and its `/\` spelling), which
 * inherits the page scheme and so resolves to a cross-origin target rather than
 * an in-app one.
 */
const RELATIVE_HREF = /^(?:[/?#](?![/\\])|\.{1,2}\/)/;

/** The text a neutralized href carries in place of a navigation. */
const BLOCKED_HREF_TITLE = 'This link was blocked because it is not an http(s) URL.';

/**
 * A blocked href, rendered as plain text: no anchor, no `href`, no handlers, so
 * it can never become a live navigation target. Shared by `Button`'s link form
 * and by `ExternalLinkButton`, which applies the stricter http(s)-only policy.
 */
export function NeutralizedLink({
  className,
  style,
  children,
}: {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
}) {
  return (
    <span
      data-neutralized="true"
      aria-disabled="true"
      title={BLOCKED_HREF_TITLE}
      className={className}
      style={style}
    >
      {children}
    </span>
  );
}

type HrefKind = 'internal' | 'external' | 'blocked';

/** Sorts an href into the three link forms the button renders. */
function classifyHref(href: string): HrefKind {
  if (isSafeHttpUrl(href)) return 'external';
  if (RELATIVE_HREF.test(href)) return 'internal';
  return 'blocked';
}

// -- Button ------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

/** The variant a `Button` wears when the caller names none. */
export const DEFAULT_BUTTON_VARIANT: ButtonVariant = 'secondary';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'tai-btn tai-btn-primary',
  secondary: 'tai-btn tai-btn-secondary',
  ghost: 'tai-btn tai-btn-ghost',
  danger: 'tai-btn tai-btn-danger',
};

interface ButtonVariantProps {
  readonly variant?: ButtonVariant;
}

/**
 * An action (no `href`) or a link (`href`). The union keeps anchor attributes
 * off the action form and button attributes off the link form.
 */
export type ButtonProps =
  | (ButtonVariantProps & ButtonHTMLAttributes<HTMLButtonElement> & { readonly href?: undefined })
  | (ButtonVariantProps & AnchorHTMLAttributes<HTMLAnchorElement> & { readonly href: string });

/** The variant class plus the caller's, which sorts last so it can override. */
export function buttonClass(variant: ButtonVariant, className: string | undefined): string {
  return className === undefined
    ? VARIANT_CLASS[variant]
    : `${VARIANT_CLASS[variant]} ${className}`;
}

export function Button(props: ButtonProps) {
  if (props.href === undefined) {
    const { variant = DEFAULT_BUTTON_VARIANT, className, href: _href, ...rest } = props;
    return <button {...rest} className={buttonClass(variant, className)} />;
  }

  const { variant = DEFAULT_BUTTON_VARIANT, className, style, href, children, ...rest } = props;
  const classes = buttonClass(variant, className);
  const kind = classifyHref(href);

  if (kind === 'blocked') {
    return (
      <NeutralizedLink className={classes} style={style}>
        {children}
      </NeutralizedLink>
    );
  }

  if (kind === 'internal') {
    return (
      <a {...rest} href={href} className={classes} style={style}>
        {children}
      </a>
    );
  }

  return (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noopener noreferrer external"
      className={classes}
      style={style}
    >
      {children}
    </a>
  );
}

// -- Card --------------------------------------------------------------------

export interface CardProps {
  readonly children: ReactNode;
  /** Opt in to the hover/focus lift. A card that is not itself an affordance stays flat. */
  readonly interactive?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
}

export function Card({ children, interactive = false, className, style }: CardProps) {
  const base = interactive ? 'tai-card tai-card-interactive' : 'tai-card';
  return (
    <div className={className === undefined ? base : `${base} ${className}`} style={style}>
      {children}
    </div>
  );
}

// -- Skeleton (loading) ------------------------------------------------------

export function Skeleton({
  height = 16,
  width = '100%',
}: {
  height?: number | string;
  width?: number | string;
}) {
  // The block's extent is per-instance; the sheen animation lives in the class.
  return <div aria-hidden="true" className="tai-skeleton" style={{ height, width }} />;
}

// -- EmptyState --------------------------------------------------------------

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  /** The guidance line's on-screen action — the control the description names. */
  action?: ReactNode;
}) {
  return (
    <div role="status" className="tai-empty-state">
      <p className="tai-empty-state-title">{title}</p>
      {description === undefined ? null : (
        <p style={{ margin: 'var(--tai-space-2) 0 0' }}>{description}</p>
      )}
      {action === undefined ? null : (
        <div style={{ marginTop: 'var(--tai-space-4)' }}>{action}</div>
      )}
    </div>
  );
}

// -- ErrorState (loud, visible) ----------------------------------------------

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="tai-error-state">
      {/* The icon carries the state alongside the color, never the color alone. */}
      <strong className="tai-error-state-title">
        <AlertTriangleIcon />
        Something went wrong
      </strong>
      <p style={{ margin: 'var(--tai-space-2) 0 0', whiteSpace: 'pre-wrap' }}>{message}</p>
      {onRetry === undefined ? null : (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

// -- Spinner -----------------------------------------------------------------

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span role="status" aria-label={label} className="tai-spinner" />;
}
