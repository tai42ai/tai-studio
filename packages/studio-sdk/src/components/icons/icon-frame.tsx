/**
 * The shared SVG frame every mark is drawn in, and the icon prop/component
 * types. Marks import `Icon` from here; it is deliberately not re-exported from
 * the barrel, so it is never mistaken for a mark.
 */
import type { ReactElement, SVGProps } from 'react';

/**
 * Props of every icon: the full SVG surface, so `style`, events and ARIA pass
 * through. `className` is APPENDED to the `tai-icon` sizing class rather than
 * replacing it — the same merge every other design-system primitive does.
 */
export type IconProps = SVGProps<SVGSVGElement>;

/** The shape every exported icon satisfies. */
export type IconComponent = (props: IconProps) => ReactElement;

/**
 * The shared frame every mark is drawn in. Defaults are declared BEFORE the prop
 * spread so a caller can override any of them, while `className` is destructured
 * out of the spread so the caller's class is merged with `tai-icon` instead of
 * replacing it.
 *
 * The accessibility defaults are DERIVED from whether the caller gave the icon a
 * name rather than fixed. A hard-coded `aria-hidden="true"` is not self-serving:
 * it makes `<Icon aria-label="Warning" />` — the form a caller naturally reaches
 * for — a named-but-hidden element, which exposes nothing and fails nowhere. So
 * `aria-hidden` is emitted only for an icon with NO accessible name, and an icon
 * that has one is given the `role="img"` that makes the name reachable.
 */
export function Icon({ className, children, ...props }: IconProps): ReactElement {
  const named = props['aria-label'] !== undefined || props['aria-labelledby'] !== undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={named ? undefined : 'true'}
      role={named ? 'img' : undefined}
      className={className === undefined ? 'tai-icon' : `tai-icon ${className}`}
      {...props}
    >
      {children}
    </svg>
  );
}
