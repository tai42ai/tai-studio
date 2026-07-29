/**
 * The KEYBOARD TAB STOPS this repository renders, and the design-system classes
 * each one wears, read out of the JSX.
 *
 * The visible-focus contract needs a set of ring bearers that is DERIVED. A hand
 * list of class names enforced in one direction goes stale the day someone adds
 * a focusable element: a scrolling pane given `tabIndex={0}` and a class of its
 * own is a real tab stop with no ring, and no assertion built from the sheet
 * alone can know it exists — `cursor: pointer` is a control's affordance, and a
 * scrollable pane declares none. The evidence for "this is keyboard-reachable"
 * is in the TSX, so that is where it is read from.
 *
 * A tab stop is an opening tag that is one of:
 *   - a natively focusable element (`<button>`, `<a href>`, `<input>`,
 *     `<textarea>`, `<select>`, `<summary>`);
 *   - an element carrying a NON-NEGATIVE `tabIndex`. `tabIndex={-1}` is left out:
 *     it takes the element OUT of the tab order and leaves it a programmatic
 *     focus target, which is the heading a route change moves focus to, not a
 *     surface a keyboard walks onto;
 *   - an element spreading a props object whose binding declares such a
 *     `tabIndex` — the shape a hook returns (`{...region}`), which is how the
 *     scrolling regions in this package become tab stops at all.
 *
 * The classes are read from `className` and expanded through the module-level
 * bindings of the file and of its relative imports, because a control names its
 * class through a constant far more often than inline: `controlClassName(
 * TEXTAREA_CLASS, className)` puts `.tai-textarea` on a `<textarea>` with the
 * string nowhere near the tag.
 *
 * STATED LIMIT, because a blind spot that is named is bounded: focusability is
 * read off the tag in the file that writes it. A class handed to a COMPONENT
 * that renders the focusable element (`<AppLink className="tai-nav-link">`, a
 * Radix `Content` that stamps its own `tabIndex`) is not attributed to the
 * element that component renders, so such a bearer is not derived here and its
 * caller must account for it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

/** Directories that hold no rendered source: build output and dependencies. */
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.turbo',
  'build',
  '__snapshots__',
]);

/**
 * Product source below `directory`: the files that can put a class on an
 * element. Tests, harnesses and the SDK's own `testing` entry are OUT — an
 * element that only a test renders is not a surface any user tabs onto.
 */
export function productSourcesWithin(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...productSourcesWithin(path));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.(?:test|spec)\.tsx?$/.test(entry)) continue;
    if (entry.startsWith('test-')) continue;
    if (/test-utils|test-harness/.test(path)) continue;
    if (path.includes(join('src', 'testing'))) continue;
    found.push(path);
  }
  return found;
}

/**
 * The text from `start` to the character closing the bracket it opens, quotes
 * respected so a brace inside a string neither opens nor closes anything.
 */
function balancedFrom(source: string, start: number, open: string, close: string): string {
  let depth = 0;
  let quote: string | undefined;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== undefined) {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

/** The text a `const`/`let`/`function` binding is defined as, keyed by its name. */
function bindingsIn(source: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of source.matchAll(
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*[<(]/g,
  )) {
    const brace = source.indexOf('{', match.index + match[0].length);
    if (brace !== -1) found.set(match[1] ?? '', balancedFrom(source, brace, '{', '}'));
  }
  for (const match of source.matchAll(
    /(?:^|\n)\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*(?::[^=\n]+)?=\s*/g,
  )) {
    const start = match.index + match[0].length;
    let end = start;
    let depth = 0;
    let quote: string | undefined;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote !== undefined) {
        if (character === '\\') end += 1;
        else if (character === quote) quote = undefined;
        continue;
      }
      if (character === '"' || character === "'" || character === '`') quote = character;
      else if (character === '{' || character === '(' || character === '[') depth += 1;
      else if (character === '}' || character === ')' || character === ']') depth -= 1;
      else if (character === ';' && depth === 0) break;
    }
    found.set(match[1] ?? '', source.slice(start, end));
  }
  return found;
}

/** Each named import bound in `source`, mapped to the scanned file it comes from. */
function importsIn(file: string, source: string, known: ReadonlySet<string>): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'(\.[^']*)'/g)) {
    const specifier = match[2] ?? '';
    const target = ['.ts', '.tsx', '/index.ts', '/index.tsx']
      .map((extension) => resolve(dirname(file), specifier + extension))
      .find((candidate) => known.has(candidate));
    if (target === undefined) continue;
    for (const specifiedName of (match[1] ?? '').split(',')) {
      const name =
        specifiedName
          .trim()
          .split(/\s+as\s+/)
          .pop()
          ?.trim() ?? '';
      if (name !== '') found.set(name, target);
    }
  }
  return found;
}

/** One opening JSX tag: its element name and everything between that and the `>`. */
interface OpeningTag {
  readonly name: string;
  readonly attributes: string;
}

/**
 * Every opening tag in `source`.
 *
 * The attribute run is walked rather than matched, because a `className` holds
 * an arbitrary expression: braces nest, and a `>` inside one (`{x > 0 ? a : b}`)
 * is not the end of the tag.
 */
function openingTags(source: string): OpeningTag[] {
  const tags: OpeningTag[] = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '<') continue;
    const opened = /^<([A-Za-z][\w.]*)/.exec(source.slice(index, index + 64));
    if (opened === null) continue;
    let end = index + opened[0].length;
    let depth = 0;
    let quote: string | undefined;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (quote !== undefined) {
        if (character === '\\') end += 1;
        else if (character === quote) quote = undefined;
        continue;
      }
      if (character === '"' || character === "'" || character === '`') quote = character;
      else if (character === '{') depth += 1;
      else if (character === '}') depth -= 1;
      else if (character === '>' && depth === 0) break;
    }
    tags.push({
      name: opened[1] ?? '',
      attributes: source.slice(index + opened[0].length, end),
    });
    index = end;
  }
  return tags;
}

/**
 * The value written for `attribute`, unquoted or unbraced; `undefined` when the
 * tag does not write it at all, which is the difference between "no `tabIndex`"
 * and "`tabIndex={-1}`".
 */
function attributeValue(attributes: string, attribute: string): string | undefined {
  const written = new RegExp(String.raw`(?<![\w-])${attribute}\s*=`).exec(attributes);
  if (written === null) return undefined;
  let index = written.index + written[0].length;
  while (/\s/.test(attributes[index] ?? '')) index += 1;
  const opener = attributes[index];
  if (opener === '"' || opener === "'") {
    const close = attributes.indexOf(opener, index + 1);
    return attributes.slice(index + 1, close === -1 ? attributes.length : close);
  }
  if (opener === '{') return balancedFrom(attributes, index, '{', '}').slice(1, -1);
  return '';
}

/** The elements that are in the tab order with no `tabIndex` of their own. */
const NATIVELY_FOCUSABLE = new Set(['button', 'a', 'input', 'textarea', 'select', 'summary']);

/** A `tabIndex` that takes the element OUT of the tab order. */
const NEGATIVE_TAB_INDEX = /^\s*-/;

/** A props object that puts its target in the tab order. */
const SPREADS_TAB_INDEX = /tabIndex\s*:\s*(?!\s*-)/;

export interface TabStop {
  /** The file the tag is written in, for a legible failure. */
  readonly file: string;
  /** The element name as written: `button`, `div`, `RadixDialog.Content`. */
  readonly element: string;
  /** The `tai-*` classes the tag wears, expanded through its bindings. */
  readonly classes: string[];
}

/**
 * Every tab stop in `files` that wears at least one `tai-*` class.
 *
 * A tab stop wearing none is skipped rather than reported: it is styled by
 * something outside the design system, and no rule in these sheets can give it a
 * ring. That is the one direction this derivation cannot speak to.
 */
export function tabStopsIn(files: readonly string[]): TabStop[] {
  const known = new Set(files);
  const sources = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));
  const bindings = new Map<string, Map<string, string>>();
  const imports = new Map<string, Map<string, string>>();
  for (const [file, source] of sources) {
    bindings.set(file, bindingsIn(source));
    imports.set(file, importsIn(file, source, known));
  }

  /** Where a name is bound: the file itself, or the file it is imported from. */
  function homeOf(file: string, name: string): string | undefined {
    if (bindings.get(file)?.has(name) === true) return file;
    return imports.get(file)?.get(name);
  }

  /**
   * `text` with the definition of every name it references appended, to `depth`
   * hops. A class reaches its element through as many as three: the tag names a
   * helper, the helper names a table, the table holds the literal.
   */
  function expand(text: string, file: string, depth: number, seen: Set<string>): string {
    if (depth === 0) return text;
    let out = text;
    for (const match of text.matchAll(/(?<![\w.$])([A-Za-z_$][\w$]*)/g)) {
      const name = match[1] ?? '';
      const home = homeOf(file, name);
      if (home === undefined) continue;
      const key = `${home}#${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const definition = bindings.get(home)?.get(name);
      if (definition !== undefined) out += `\n${expand(definition, home, depth - 1, seen)}`;
    }
    return out;
  }

  const stops: TabStop[] = [];
  for (const [file, source] of sources) {
    if (extname(file) !== '.tsx') continue;
    for (const tag of openingTags(source)) {
      const native =
        NATIVELY_FOCUSABLE.has(tag.name) &&
        (tag.name !== 'a' || /(?<![\w-])href\s*=/.test(tag.attributes));
      const written = attributeValue(tag.attributes, 'tabIndex');
      let tabbed = written !== undefined && !NEGATIVE_TAB_INDEX.test(written);
      if (!tabbed) {
        for (const spread of tag.attributes.matchAll(/\{\s*\.\.\.\s*([A-Za-z_$][\w$]*)/g)) {
          const name = spread[1] ?? '';
          const home = homeOf(file, name);
          if (home === undefined) continue;
          const definition = bindings.get(home)?.get(name);
          if (
            definition !== undefined &&
            SPREADS_TAB_INDEX.test(expand(definition, home, 2, new Set()))
          ) {
            tabbed = true;
            break;
          }
        }
      }
      if (!native && !tabbed) continue;
      const className = attributeValue(tag.attributes, 'className');
      if (className === undefined) continue;
      const classes = [
        ...new Set(
          [
            ...expand(className, file, 3, new Set()).matchAll(
              /(?<![\w-])(tai-[a-z][\w-]*)(?![\w])/g,
            ),
          ]
            .map((match) => `.${match[1] ?? ''}`)
            .filter((name) => !name.endsWith('-')),
        ),
      ];
      if (classes.length === 0) continue;
      stops.push({ file, element: tag.name, classes });
    }
  }
  return stops;
}
