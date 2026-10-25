/**
 * Source rules over the design-token names, shared by the repo's token-usage gate and
 * by any host that scans its own sources with the same rule (exported from
 * `@tai42/studio-sdk/testing`). Each rule reads one source text and returns its
 * offences; which files to read is the caller's choice, the rule never varies.
 */

/**
 * The property a declaration's value belongs to: the last `name:` before the
 * value, with no statement boundary in between. Written as a backwards search
 * rather than a forward `property: value` match so that a value containing its
 * own commas and parentheses — `linear-gradient(90deg, …)`, or the next entry of
 * a JSX style object — cannot make the scan attribute the value to the wrong
 * property or miss it entirely.
 */
export function governingProperty(source: string, valueIndex: number): string | undefined {
  const match = /([-A-Za-z][\w-]*)\s*:\s*[^;{}:]*$/.exec(source.slice(0, valueIndex));
  return match?.[1];
}

/** Every reference to a destructive role token, in a stylesheet or a JSX inline style. */
const DESTRUCTIVE_REFERENCE = /var\(\s*--tai-color-(?:on-)?destructive/g;

/** The one rule whose label sits on the destructive fill. */
const DESTRUCTIVE_BUTTON_SELECTOR = /^\.tai-btn-danger(?![\w-])/;

/**
 * Whether the declaration at `valueIndex` sits inside a CSS rule whose every
 * selector is the destructive button. The selector is the text between the
 * previous statement boundary and the innermost open brace, with comments removed.
 */
function insideDestructiveButtonRule(source: string, valueIndex: number): boolean {
  const before = source.slice(0, valueIndex);
  const open = before.lastIndexOf('{');
  if (open === -1 || before.lastIndexOf('}') > open) return false;
  const head = before.slice(0, open);
  const start = Math.max(head.lastIndexOf('}'), head.lastIndexOf('{'), head.lastIndexOf(';')) + 1;
  const selectors = head
    .slice(start)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(',')
    .map((selector) => selector.trim());
  return selectors.every((selector) => DESTRUCTIVE_BUTTON_SELECTOR.test(selector));
}

/**
 * The properties in `source` that paint text with a destructive role token, in the
 * order they appear. The destructive tokens are the fill, its hover and the label on
 * that fill: a fill colour as text fails contrast on the dark grounds, so error text
 * takes `--tai-color-err-text` instead. A `color` declaration (CSS or JSX) is an
 * offence anywhere but the `.tai-btn-danger` rule, where the label colour belongs. A
 * reference whose property cannot be read is reported as `<no property found>`: an
 * unattributable declaration is a hole in the rule, not a pass.
 */
export function destructiveColorOffences(source: string): string[] {
  const offences: string[] = [];
  for (const match of source.matchAll(DESTRUCTIVE_REFERENCE)) {
    const property = governingProperty(source, match.index);
    if (property === undefined) {
      offences.push('<no property found>');
    } else if (property === 'color' && !insideDestructiveButtonRule(source, match.index)) {
      offences.push(property);
    }
  }
  return offences;
}
