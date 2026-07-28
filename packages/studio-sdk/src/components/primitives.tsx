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
 * become a live navigation target. This is an XSS pin. The neutralized text names
 * BOTH admitted forms, because an in-app reference is not an http(s) URL either
 * and saying only "not an http(s) URL" would describe `/tools` as blocked.
 *
 * The check reads the NORMALIZED reference and the anchor is given that same
 * normalized string, because the raw input and the URL the browser resolves are
 * not the same URL. See `normalizeHref`.
 */
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
  Ref,
} from 'react';

import { XCircleIcon } from './icons';

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
 *
 * The lookahead belongs to the `/` branch ALONE. Applied to `#` and `?` as well
 * it rejected `#/agents` — a hash route, the most common client-routed reference
 * form there is, and one of the five spellings this module's own docblock says
 * "stays in-app" — sending it to the neutralized span reserved for
 * `javascript:`. Neither `#//evil.example` nor `?//evil.example` can be
 * cross-origin: both resolve against the current document, so the lookahead
 * bought nothing on those two branches and cost a whole routing style.
 */
const RELATIVE_HREF = /^(?:\/(?![/\\])|[?#]|\.{1,2}\/)/;

/**
 * The text a neutralized href carries in place of a navigation. It names both
 * admitted forms: `/tools` and `#/agents` are in-app references rather than
 * http(s) URLs and DO render as live anchors, so a reason citing only the
 * http(s) rule would state a rule this component does not enforce.
 */
const BLOCKED_HREF_TITLE =
  'This link was blocked because it is neither an in-app reference nor an http(s) URL.';

/**
 * Takes a subtree out of the accessibility tree without taking it out of the
 * layout: `display: contents` generates no box, so wrapped children stay direct
 * flex items of the button surface around them.
 */
const hiddenFromReadersStyle: CSSProperties = { display: 'contents' };

/**
 * A blocked href, rendered as inert text: no anchor, no `href`, no handlers, so
 * it can never become a live navigation target. Shared by `Button`'s link form
 * and by `ExternalLinkButton`, which applies the stricter http(s)-only policy.
 *
 * Its surface is DELIBERATELY narrow. It takes the paint, the id and the name,
 * and nothing else the caller wrote on the anchor: the props a live link needs
 * are the props a dead one must not have, so they are refused here rather than
 * spread onto the span.
 *
 * It stays ROLE-LESS on purpose — it is not a link and must not be announced as
 * one. That is also why the caller's name arrives as visually-hidden TEXT rather
 * than `aria-label`: ARIA prohibits both naming attributes on the `generic` role
 * a bare `<span>` maps to, so a platform that honours the prohibition computes NO
 * name from them and an icon-only blocked link announces as nothing at all. Text
 * has no such restriction — a generic element contributes no accessible NAME, but
 * its content is still read. `aria-disabled` stays because
 * `.tai-btn[aria-disabled='true']` is what paints the disabled look; it is inert
 * on a role-less element, and the missing `href` is what actually says this does
 * not navigate.
 *
 * A caller-supplied `label` REPLACES the children for assistive tech, exactly as
 * the `aria-label` it comes from would have done on the live anchor: the children
 * go behind an `aria-hidden` wrapper that is `display: contents`, so it generates
 * no box and the button's own flex layout is unchanged. Without that the children
 * and the label are both read and a blocked link announces its name twice.
 */
export function NeutralizedLink({
  className,
  style,
  children,
  id,
  label,
}: {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly children?: ReactNode;
  /** Kept so an external `aria-labelledby`/`aria-describedby` IDREF still lands. */
  readonly id?: string;
  /**
   * The name the caller gave the link, rendered as hidden text. An icon-only
   * link carries its whole meaning here, and when it is given the children are
   * hidden from assistive tech so the name is read once, not twice.
   */
  readonly label?: string;
}) {
  return (
    <span
      data-neutralized="true"
      aria-disabled="true"
      title={BLOCKED_HREF_TITLE}
      className={className}
      style={style}
      id={id}
    >
      {label === undefined ? (
        children
      ) : (
        <span aria-hidden="true" style={hiddenFromReadersStyle}>
          {children}
        </span>
      )}
      {/* `title` on a non-focusable span is not reliably announced, so the name
          and the reason the link is dead are carried as real text. An icon-only
          link would otherwise neutralize into a silent nothing. */}
      <span className="tai-visually-hidden">
        {label === undefined ? BLOCKED_HREF_TITLE : `${label}. ${BLOCKED_HREF_TITLE}`}
      </span>
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

// -- Shared surface props -----------------------------------------------------

/**
 * What every primitive in this file accepts alongside its own props: the
 * design-system class it wears is its own, and the caller's `className` is
 * APPENDED to it rather than replacing it, so a surface can never lose its paint
 * by being positioned.
 */
interface SurfaceProps {
  readonly className?: string;
  readonly style?: CSSProperties;
}

/** The surface's own class plus the caller's, which sorts last so it can override. */
function surfaceClass(base: string, className: string | undefined): string {
  return className === undefined ? base : `${base} ${className}`;
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

/**
 * The one prop both forms share. Deliberately NOT on the public surface: it is a
 * shared base, and declaration emit keeps it visible inside `primitives.d.ts`
 * where `ButtonProps`/`LinkButtonProps` reference it, so consumers still see
 * `variant` and can still `extends` either interface.
 */
interface ButtonVariantProps {
  readonly variant?: ButtonVariant;
}

/**
 * The ACTION form of `Button`: button attributes, no anchor ones.
 *
 * This stays an INTERFACE extending `ButtonHTMLAttributes<HTMLButtonElement>`
 * because it is published plugin API: a plugin may write
 * `interface MyButton extends ButtonProps {}` (a union cannot be extended —
 * TS2312) and may hand a `ButtonProps` value to a slot typed as plain
 * `ButtonHTMLAttributes<HTMLButtonElement>` (a union including anchor attributes
 * is not assignable — TS2322). The link form is the ADDITIVE `LinkButtonProps`,
 * and `Button` accepts either.
 *
 * It declares NO `href` member. `href?: undefined` here would make
 * `interface MyButton extends ButtonProps { href: string }` a TS2430
 * ("incorrectly extends"), which is a narrowing of a surface that is additive
 * only. The discriminant `Button` narrows on lives on `ButtonActionProps`.
 */
export interface ButtonProps extends ButtonVariantProps, ButtonHTMLAttributes<HTMLButtonElement> {
  /** A consumer ref for the `<button>`; the prop spread forwards it. */
  readonly ref?: Ref<HTMLButtonElement>;
}

/**
 * The action form as `Button` ACCEPTS it: `ButtonProps` plus the absent-`href`
 * discriminant, which is what lets the body narrow `props.href` without a cast.
 *
 * Like `ButtonVariantProps` this is deliberately off the public surface — a
 * plugin extends `ButtonProps` — and declaration emit keeps it visible inside
 * `primitives.d.ts`, where `Button`'s signature references it.
 */
interface ButtonActionProps extends ButtonProps {
  readonly href?: undefined;
}

/**
 * The LINK form of `Button`: an `href`, so it carries anchor attributes and no
 * button ones.
 *
 * `target` and `rel` are inherited from `AnchorHTMLAttributes` and are settable,
 * but on the EXTERNAL branch they are not the caller's to choose: an absolute
 * http(s) URL always renders `target="_blank"` with
 * `rel="noopener noreferrer external"`, whatever the caller passed. On the
 * in-app branch `target` is the caller's and `rel` is pinned only when they ask
 * for `_blank`.
 *
 * It declares NO `ref`, and that is a REFUSAL rather than an omission: a blocked
 * href renders a {@link NeutralizedLink} span and no anchor at all, so a
 * `Ref<HTMLAnchorElement>` would be filled on two of the three renderings and
 * left null on the third — a ref that silently does nothing for exactly the
 * input the check exists to catch. A caller that needs the element wraps the
 * button.
 */
export interface LinkButtonProps
  extends ButtonVariantProps, AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly href: string;
}

/** The variant class plus the caller's, which sorts last so it can override. */
export function buttonClass(variant: ButtonVariant, className: string | undefined): string {
  return surfaceClass(VARIANT_CLASS[variant], className);
}

export function Button(props: ButtonActionProps | LinkButtonProps) {
  if (props.href === undefined) {
    const { variant = DEFAULT_BUTTON_VARIANT, className, href: _href, ...rest } = props;
    return <button {...rest} className={buttonClass(variant, className)} />;
  }

  const { variant = DEFAULT_BUTTON_VARIANT, className, style, href, children, ...rest } = props;
  const classes = buttonClass(variant, className);
  const link = resolveHref(href);

  if (link.kind === 'blocked') {
    // Only the four props that survive the neutralization cross: the paint, the
    // id an external IDREF may point at, and the caller's name (as text). Every
    // other anchor prop is REFUSED rather than forwarded — `target`/`rel`
    // describe a navigation that is not happening, and a handler spread onto the
    // span would make the dead link live again, which is the whole defect.
    return (
      <NeutralizedLink className={classes} style={style} id={rest.id} label={rest['aria-label']}>
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
      // REVERSE TABNABBING. `target`/`rel` are settable on `LinkButtonProps`, so
      // the hardening is carried by JSX property ORDER alone: the spread comes
      // FIRST and these two are written after it, which is what makes them
      // unoverridable. Below the spread, `rel="opener" target="_self"` from a
      // caller would open a cross-origin `_blank` with a live `window.opener`
      // onto the operator's authenticated tab.
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

export interface CardProps extends SurfaceProps {
  readonly children: ReactNode;
  /** Opt in to the hover/focus lift. A card that is not itself an affordance stays flat. */
  readonly interactive?: boolean;
  /** A consumer ref for the card element itself. */
  readonly ref?: Ref<HTMLDivElement>;
}

export function Card({ children, interactive = false, className, style, ref }: CardProps) {
  const base = interactive ? 'tai-card tai-card-interactive' : 'tai-card';
  return (
    <div className={surfaceClass(base, className)} style={style} ref={ref}>
      {children}
    </div>
  );
}

// -- Skeleton (loading) ------------------------------------------------------

export interface SkeletonProps extends SurfaceProps {
  readonly height?: number | string;
  readonly width?: number | string;
}

export function Skeleton({ height = 16, width = '100%', className, style }: SkeletonProps) {
  // The block's extent is per-instance; the sheen animation lives in the class.
  return (
    <div
      aria-hidden="true"
      className={surfaceClass('tai-skeleton', className)}
      style={{ height, width, ...style }}
    />
  );
}

// -- EmptyState --------------------------------------------------------------

export interface EmptyStateProps extends SurfaceProps {
  readonly title: string;
  readonly description?: string;
  /** The guidance line's on-screen action — the control the description names. */
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, action, className, style }: EmptyStateProps) {
  return (
    <div role="status" className={surfaceClass('tai-empty-state', className)} style={style}>
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

/**
 * The headline every `ErrorState` wears.
 *
 * It is fixed, and the whole surface says one thing with it: `role="alert"`
 * interrupts, the crossed circle is the ERROR mark, and `.tai-error-state` is the
 * error ground. A DELIBERATE refusal — a permission denial, a server's dry-run
 * "no" — is an answer rather than a malfunction, and swapping this headline alone
 * would leave the mark, the ground and the live-region politeness all still
 * announcing a system failure. Such a surface takes the design system's warn
 * ground instead — `.tai-warn-state` for a warning block (`advisories.tsx`,
 * `fleet-report.tsx`, `RunPanel.tsx`), or `role="status"` with a warn `Badge` for
 * a verdict that only lands after the reader acts (`verdict.tsx`). The live-region
 * politeness — `role="alert"` for a warning that interrupts, `role="status"` for
 * one the reader came to find — is the surface's to choose, not this headline's.
 */
const ERROR_TITLE = 'Something went wrong';

export interface ErrorStateProps extends SurfaceProps {
  readonly message: string;
  readonly onRetry?: () => void;
}

export function ErrorState({ message, onRetry, className, style }: ErrorStateProps) {
  return (
    <div role="alert" className={surfaceClass('tai-error-state', className)} style={style}>
      {/* The icon carries the state alongside the color, never the color alone,
          and it is the ERROR mark: the crossed circle. The warning triangle is
          the warn surfaces' mark and would state a second severity here. */}
      <strong className="tai-error-state-title">
        <XCircleIcon />
        {ERROR_TITLE}
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

export interface SpinnerProps extends SurfaceProps {
  readonly label?: string;
}

export function Spinner({ label = 'Loading', className, style }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={surfaceClass('tai-spinner', className)}
      style={style}
    />
  );
}
