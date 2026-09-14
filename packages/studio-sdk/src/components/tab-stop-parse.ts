/**
 * The low-level parsing behind `tabStopsIn`: balanced-bracket and value scanning,
 * a tag's attribute value, the binding/import RESOLVER (name → its home file and
 * definition, expanded across hops), and the two per-tag predicates —
 * `tagDeclaresTab` (is this a tab stop?) and `taiClassesOf` (which `tai-*` classes
 * does it wear?).
 */

/**
 * The text from `start` to the character closing the bracket it opens, quotes
 * respected so a brace inside a string neither opens nor closes anything.
 */
export function balancedFrom(source: string, start: number, open: string, close: string): string {
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

/**
 * The RHS of a `const`/`let` assignment beginning at `start`: text up to the
 * top-level `;`, with brackets and quotes tracked so a `;` inside either does not
 * end it.
 */
const QUOTE_CHARS = '"\'`';
const OPEN_BRACKETS = '{([';
const CLOSE_BRACKETS = '})]';

export function readAssignmentValue(source: string, start: number): string {
  let end = start;
  let depth = 0;
  let quote: string | undefined;
  for (; end < source.length; end += 1) {
    const character = source[end] ?? '';
    if (quote !== undefined) {
      if (character === '\\') end += 1;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (QUOTE_CHARS.includes(character)) quote = character;
    else if (OPEN_BRACKETS.includes(character)) depth += 1;
    else if (CLOSE_BRACKETS.includes(character)) depth -= 1;
    else if (character === ';' && depth === 0) break;
  }
  return source.slice(start, end);
}

/**
 * The index of the `>` closing an opening tag whose attribute run starts at
 * `from`, quotes and brace depth tracked so a `>` inside a `className` expression
 * (`{x > 0 ? a : b}`) is not mistaken for it.
 */
export function scanToTagClose(source: string, from: number): number {
  let end = from;
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
  return end;
}

/** One opening JSX tag: its element name and everything between that and the `>`. */
export interface OpeningTag {
  readonly name: string;
  readonly attributes: string;
}

/**
 * The value written for `attribute`, unquoted or unbraced; `undefined` when the
 * tag does not write it at all, which is the difference between "no `tabIndex`"
 * and "`tabIndex={-1}`".
 */
export function attributeValue(attributes: string, attribute: string): string | undefined {
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

/** Resolves a referenced name to the file it is bound in and its definition text. */
export interface TabStopResolver {
  /** Where a name is bound: the file itself, or the file it is imported from. */
  homeOf(file: string, name: string): string | undefined;
  /** The definition text of `name` bound in `home`, if any. */
  definitionOf(home: string, name: string): string | undefined;
  /**
   * `text` with the definition of every name it references appended, to `depth`
   * hops — a class reaches its element through as many as three (the tag names a
   * helper, the helper names a table, the table holds the literal).
   */
  expand(text: string, file: string, depth: number, seen: Set<string>): string;
}

/** A resolver over pre-scanned per-file binding and import maps. */
export function createTabStopResolver(
  bindings: ReadonlyMap<string, Map<string, string>>,
  imports: ReadonlyMap<string, Map<string, string>>,
): TabStopResolver {
  function homeOf(file: string, name: string): string | undefined {
    if (bindings.get(file)?.has(name) === true) return file;
    return imports.get(file)?.get(name);
  }

  function definitionOf(home: string, name: string): string | undefined {
    return bindings.get(home)?.get(name);
  }

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
      const definition = definitionOf(home, name);
      if (definition !== undefined) out += `\n${expand(definition, home, depth - 1, seen)}`;
    }
    return out;
  }

  return { homeOf, definitionOf, expand };
}

/** Whether a spread props object on the tag declares a non-negative `tabIndex`. */
function spreadDeclaresTab(tag: OpeningTag, file: string, resolver: TabStopResolver): boolean {
  for (const spread of tag.attributes.matchAll(/\{\s*\.\.\.\s*([A-Za-z_$][\w$]*)/g)) {
    const home = resolver.homeOf(file, spread[1] ?? '');
    if (home === undefined) continue;
    const definition = resolver.definitionOf(home, spread[1] ?? '');
    if (
      definition !== undefined &&
      SPREADS_TAB_INDEX.test(resolver.expand(definition, home, 2, new Set()))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Whether the tag is a keyboard tab stop: a natively focusable element, an element
 * with a non-negative `tabIndex`, or one spreading a props object that declares one.
 */
export function tagDeclaresTab(tag: OpeningTag, file: string, resolver: TabStopResolver): boolean {
  const native =
    NATIVELY_FOCUSABLE.has(tag.name) &&
    (tag.name !== 'a' || /(?<![\w-])href\s*=/.test(tag.attributes));
  if (native) return true;
  const written = attributeValue(tag.attributes, 'tabIndex');
  if (written !== undefined && !NEGATIVE_TAB_INDEX.test(written)) return true;
  return spreadDeclaresTab(tag, file, resolver);
}

/** The `tai-*` classes the tag wears, expanded through its bindings to `depth` 3. */
export function taiClassesOf(tag: OpeningTag, file: string, resolver: TabStopResolver): string[] {
  const className = attributeValue(tag.attributes, 'className');
  if (className === undefined) return [];
  return [
    ...new Set(
      [
        ...resolver
          .expand(className, file, 3, new Set())
          .matchAll(/(?<![\w-])(tai-[a-z][\w-]*)(?![\w])/g),
      ]
        .map((match) => `.${match[1] ?? ''}`)
        .filter((name) => !name.endsWith('-')),
    ),
  ];
}
