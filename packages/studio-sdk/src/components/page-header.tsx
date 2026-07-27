/**
 * `PageHeader`, `Page`, `Stack` — the screen scaffolding every feature was
 * hand-rolling as a flex column plus an ad-hoc heading block.
 *
 * `PageHeader` owns a DOM contract the end-to-end suites assert: exactly one
 * `<h1>` whose accessible name is the title VERBATIM. The nav-section eyebrow a
 * screen shows above its title is therefore a SIBLING of the `<h1>`, never a
 * child — nesting it would fold it into the computed name and break every
 * heading assertion. The `<h1>` is also permanently focusable
 * (`tabIndex={-1}`) so a route change can move focus to the new screen's title.
 */
import type { CSSProperties, ReactElement, ReactNode, Ref } from 'react';

/** The wrapper props both layout primitives share, ref included. */
interface LayoutElementProps {
  readonly className?: string;
  readonly style?: CSSProperties;
  /** A consumer ref for the wrapper element itself. */
  readonly ref?: Ref<HTMLDivElement>;
}

export interface PageHeaderProps {
  /** The screen's title. It is the `<h1>`'s accessible name, VERBATIM. */
  readonly title: string;
  /** The screen's existing nav-section label, rendered ABOVE the h1 — never inside it. */
  readonly eyebrow?: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly titleRef?: Ref<HTMLHeadingElement>;
  /**
   * An id for the `<h1>`, not for the `<header>` root. The heading is the element
   * a caller has a reason to address — an `aria-labelledby` pointing at it names
   * the region from the screen's own title — and it is also the focus target a
   * route change moves to.
   */
  readonly id?: string;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  titleRef,
  id,
}: PageHeaderProps): ReactElement {
  return (
    <header className="tai-page-header">
      <div>
        {eyebrow === undefined ? null : <div className="tai-label">{eyebrow}</div>}
        <h1 className="tai-page-title" tabIndex={-1} ref={titleRef} id={id}>
          {title}
        </h1>
        {description === undefined ? null : <p className="tai-page-description">{description}</p>}
      </div>
      {actions === undefined ? null : <div className="tai-page-actions">{actions}</div>}
    </header>
  );
}

export interface PageLayoutProps extends LayoutElementProps {
  readonly children: ReactNode;
}

/** The screen wrapper: the max-width, the gutters, and the vertical rhythm. */
export function Page({ children, className, style, ref }: PageLayoutProps): ReactElement {
  return (
    <div
      className={className === undefined ? 'tai-page' : `tai-page ${className}`}
      style={style}
      ref={ref}
    >
      {children}
    </div>
  );
}

export interface StackProps extends LayoutElementProps {
  readonly children: ReactNode;
  /** The gap step; 4 is the default and needs no modifier class. */
  readonly gap?: 2 | 3 | 4 | 6;
}

/** The modifier class per non-default gap step; gap 4 is `.tai-stack`'s own gap. */
const STACK_GAP_CLASS: Record<2 | 3 | 6, string> = {
  2: 'tai-stack-2',
  3: 'tai-stack-3',
  6: 'tai-stack-6',
};

/** A vertical flex column on the spacing scale. */
export function Stack({ children, gap = 4, className, style, ref }: StackProps): ReactElement {
  const classes = ['tai-stack'];
  if (gap !== 4) classes.push(STACK_GAP_CLASS[gap]);
  if (className !== undefined) classes.push(className);
  return (
    <div className={classes.join(' ')} style={style} ref={ref}>
      {children}
    </div>
  );
}
