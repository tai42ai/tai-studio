/**
 * Owned DS primitives, wearing the design-system classes from
 * `components.css`. These cover the shared UI states every feature drives from
 * TanStack Query: loading skeletons, a shared empty state, and a loud error
 * surface. Plugins consume these — never raw Tailwind utilities.
 *
 * `Button` is ONE implementation for both an action and a link. Given an `href`
 * it renders an anchor, and that href is checked against an http/https
 * allow-list: a reference beginning `/`, `?`, `#`, `./` or `../` stays in-app, an
 * absolute `http://`/`https://` URL opens in a new tab with
 * `rel="noopener noreferrer external"`, and everything else — another scheme
 * (`javascript:`, `data:`, …), a protocol-relative `//host`, a bare `page.html` —
 * is NEUTRALIZED, rendered as plain text with no href, so a hostile URL can never
 * become a live navigation target. This is an XSS pin.
 *
 * The check reads the NORMALIZED reference and the anchor is given that same
 * normalized string, because the raw input and the URL the browser resolves are
 * not the same URL. See `normalizeHref`.
 */
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

import { AlertTriangleIcon } from './icons';

// -- Link safety --------------------------------------------------------------

/**
 * The reference with the characters the URL parser throws away before it parses:
 * ASCII tab, LF and CR ANYWHERE in the string, plus leading and trailing C0
 * controls and spaces.
 *
 * Reading the raw string instead means checking a different URL from the one the
 * browser resolves. `/<TAB>/evil.com` is not a root-relative path — the parser
 * deletes the tab, making it the protocol-relative `//evil.com`, which is
 * cross-origin.
 */
function normalizeHref(href: string): string {
  const inner = href.replaceAll(/[\t\n\r]/g, '');
  // The leading/trailing strip walks code points rather than using a character
  // class, so it covers every C0 control without a control-character regex.
  let start = 0;
  let end = inner.length;
  while (start < end && inner.charCodeAt(start) <= 0x20) start++;
  while (end > start && inner.charCodeAt(end - 1) <= 0x20) end--;
  return inner.slice(start, end);
}

/**
 * The absolute http(s) URL `href` denotes, or `undefined` when it denotes none.
 *
 * The `//` is required rather than inferred from a successful `new URL()`,
 * because for a scheme that matches the document's own, the authority-less
 * spelling is a PATH: an anchor with `href="https:/settings"` on an https page
 * navigates to `/settings` on the CURRENT origin, while `new URL()` with no base
 * reads the same string as the host `settings`. Only the `//` form means the same
 * thing to both.
 *
 * Callers render the returned string rather than their input, so the URL that was
 * judged is always the URL that is navigated.
 */
export function safeHttpUrl(href: string): string | undefined {
  const normalized = normalizeHref(href);
  if (!/^https?:\/\//i.test(normalized)) return undefined;
  try {
    return new URL(normalized).href;
  } catch {
    return undefined;
  }
}

/** True only for an absolute `http://`/`https://` URL. Everything else is unsafe. */
export function isSafeHttpUrl(url: string): boolean {
  return safeHttpUrl(url) !== undefined;
}

/**
 * A same-document, root-relative or explicitly relative reference. The negative
 * lookahead rejects a protocol-relative `//host` (and its `/\` spelling), which
 * inherits the page scheme and so resolves to a cross-origin target rather than
 * an in-app one. Tested against the NORMALIZED reference — see `normalizeHref`.
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
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
  /** Kept so an external `aria-labelledby`/`aria-describedby` IDREF still lands. */
  readonly id?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
}) {
  return (
    <span
      data-neutralized="true"
      aria-disabled="true"
      title={BLOCKED_HREF_TITLE}
      className={className}
      style={style}
      id={id}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      {children}
      {/* `title` on a non-focusable span is not reliably announced, so the reason
          the link is dead is carried as real text for assistive tech. An
          icon-only link would otherwise neutralize into an unnamed nothing. */}
      <span className="tai-visually-hidden">{BLOCKED_HREF_TITLE}</span>
    </span>
  );
}

interface ResolvedHref {
  readonly kind: 'internal' | 'external' | 'blocked';
  /** The reference to put in the anchor: exactly the one that was judged. */
  readonly href: string;
}

/**
 * Sorts an href into the three link forms the button renders, and returns the
 * normalized reference alongside. Rendering the caller's raw string instead
 * would let the anchor navigate somewhere the check never saw.
 */
function resolveHref(href: string): ResolvedHref {
  const external = safeHttpUrl(href);
  if (external !== undefined) return { kind: 'external', href: external };
  const normalized = normalizeHref(href);
  if (RELATIVE_HREF.test(normalized)) return { kind: 'internal', href: normalized };
  return { kind: 'blocked', href: '' };
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
  const link = resolveHref(href);

  if (link.kind === 'blocked') {
    return (
      <NeutralizedLink
        className={classes}
        style={style}
        id={rest.id}
        aria-label={rest['aria-label']}
        aria-labelledby={rest['aria-labelledby']}
      >
        {children}
      </NeutralizedLink>
    );
  }

  if (link.kind === 'internal') {
    return (
      <a
        {...rest}
        href={link.href}
        // An in-app link is same-origin, but a caller may still ask for a new
        // tab; `rel` is pinned after the spread so that ask cannot drop it.
        {...(rest.target === '_blank' ? { rel: 'noopener noreferrer' } : {})}
        className={classes}
        style={style}
      >
        {children}
      </a>
    );
  }

  return (
    <a
      {...rest}
      href={link.href}
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
