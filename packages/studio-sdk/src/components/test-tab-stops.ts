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

import {
  balancedFrom,
  createTabStopResolver,
  readAssignmentValue,
  scanToTagClose,
  tagDeclaresTab,
  taiClassesOf,
  type OpeningTag,
} from './tab-stop-parse';

export type { OpeningTag } from './tab-stop-parse';

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
    found.set(match[1] ?? '', readAssignmentValue(source, match.index + match[0].length));
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

/** Every opening tag in `source`, its attribute run walked so a `>` inside a
 *  `className` expression is not mistaken for the tag's close. */
function openingTags(source: string): OpeningTag[] {
  const tags: OpeningTag[] = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '<') continue;
    const opened = /^<([A-Za-z][\w.]*)/.exec(source.slice(index, index + 64));
    if (opened === null) continue;
    const nameEnd = index + opened[0].length;
    const end = scanToTagClose(source, nameEnd);
    tags.push({ name: opened[1] ?? '', attributes: source.slice(nameEnd, end) });
    index = end;
  }
  return tags;
}

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
  const resolver = createTabStopResolver(bindings, imports);

  const stops: TabStop[] = [];
  for (const [file, source] of sources) {
    if (extname(file) !== '.tsx') continue;
    for (const tag of openingTags(source)) {
      if (!tagDeclaresTab(tag, file, resolver)) continue;
      const classes = taiClassesOf(tag, file, resolver);
      if (classes.length === 0) continue;
      stops.push({ file, element: tag.name, classes });
    }
  }
  return stops;
}
