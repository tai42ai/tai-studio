/**
 * The stylesheet reader every static gate in this directory parses CSS with.
 *
 * `vitest.config.ts` sets `css: false` and jsdom runs no layout, so no unit test
 * here evaluates a rule: everything the sheets decide is asserted by reading the
 * source. Each gate grew its own reader, and the readers drifted — two of them
 * neutralised a brace inside a quoted value and the rest counted braces raw, so
 * the same `content: '}'` that one gate parsed correctly truncated a rule for
 * another and desynchronised every block after it. A parser bug in a gate is not
 * a wrong answer, it is a silent GREEN, so the parse lives in one place and every
 * gate reads the sheets the same way.
 *
 * Nothing here asserts. The gates own the contracts; this module owns the parse.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Directories that hold no authored stylesheet: build output and dependencies. */
export const SKIP_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.turbo',
  'build',
]);

/** Every `.css` file below `directory`, recursively, build output aside. */
export function stylesheetsWithin(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) {
        found.push(...stylesheetsWithin(join(directory, entry.name)));
      }
    } else if (entry.name.endsWith('.css')) {
      found.push(join(directory, entry.name));
    }
  }
  return found;
}

/**
 * `source` with every brace inside a quoted value replaced by a space.
 *
 * The walk below counts braces, and a brace is legal inside a CSS string: one
 * `content: '}'` truncates the rule it sits in and puts every brace count after
 * it out by one, so a cancellation later in the sheet is read at the wrong depth
 * — or not read at all. Only the braces are neutralised, at the same offsets: the
 * quotes themselves stay, because `[data-theme='dark']` is a selector the gates
 * match as written.
 */
export function neutraliseQuotedBraces(source: string): string {
  let out = '';
  let quote: string | undefined;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    if (quote !== undefined) {
      if (character === '\\') {
        out += source.slice(index, index + 2);
        index += 1;
        continue;
      }
      if (character === quote) quote = undefined;
      out += character === '{' || character === '}' ? ' ' : character;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    out += character;
  }
  return out;
}

/**
 * `source` with its block comments blanked to a space.
 *
 * These sheets introduce their rules with prose docblocks, and a comma, a brace
 * or a class name inside one is structure to a reader that has not stripped
 * them: an unbalanced `}` in prose truncates whichever block was being read, and
 * a class NAMED in a comment reads as a class DECLARED.
 */
export function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Stylesheet text as the gates parse it: no comments, no brace inside a string. */
export function sheetText(source: string): string {
  return neutraliseQuotedBraces(withoutComments(source));
}

export interface Rule {
  /** The selector list as written, one string. */
  readonly selector: string;
  /** That list split on its top-level commas, trimmed, blanks dropped. */
  readonly selectors: string[];
  /** The declaration block, without its braces. */
  readonly body: string;
  /** The at-rule preludes this rule is nested inside, outermost first. */
  readonly context: string[];
}

/**
 * A selector list split into its individual selectors.
 *
 * The split respects parentheses: `:is(.a, .b)`, `:where()`, `:not()` and
 * `:has()` all take comma-separated arguments, and a comma inside one separates
 * ARGUMENTS rather than selectors. Splitting on every comma turns one such
 * selector into two malformed halves, and every membership test against the
 * result then asks about a string no sheet contains.
 */
export function selectorsOf(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of selector) {
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/**
 * Every declaration block in `source`, with the at-rule context it sits inside.
 *
 * The context is what a context-free scraper never asks for, and it decides
 * whether a rule reaches a screen at all: wrapping a whole shared block in
 * `@media (min-width: 2000px)` leaves every rule PRESENT to a reader that only
 * matches selectors and bodies, while no real screen ever applies it. Nesting is
 * tracked to any depth, so a band inside a `@supports` inside a `@layer` is still
 * reached.
 *
 * A STATEMENT at-rule ends at a semicolon rather than at a block, and the walk
 * resets the prelude there: without that, `@layer a, b;` and the rule after it
 * read as one at-rule prelude and the rule is never emitted, so every assertion
 * about it passes on a rule the reader silently lost.
 */
export function readRules(source: string): Rule[] {
  const found: Rule[] = [];
  const context: string[] = [];
  const text = sheetText(source);
  let prelude = '';
  let index = 0;

  while (index < text.length) {
    const character = text[index] ?? '';
    if (character === ';' && prelude.trim().startsWith('@')) {
      prelude = '';
      index += 1;
      continue;
    }
    if (character === '{') {
      const head = prelude.trim();
      prelude = '';
      index += 1;
      if (head.startsWith('@')) {
        context.push(head);
        continue;
      }
      // A declaration block: read to its close. These sheets nest no rule inside
      // a rule, and every brace that could sit in a value has been neutralised,
      // so the next `}` is this block's.
      const end = text.indexOf('}', index);
      const close = end === -1 ? text.length : end;
      found.push({
        selector: head,
        selectors: selectorsOf(head),
        body: text.slice(index, close),
        context: [...context],
      });
      index = close + 1;
      continue;
    }
    if (character === '}') {
      context.pop();
      prelude = '';
      index += 1;
      continue;
    }
    prelude += character;
    index += 1;
  }
  return found;
}

/**
 * A media query keyed on viewport WIDTH — a rule that does not apply everywhere.
 *
 * Every spelling CSS accepts, because a rule is banded whichever way the band is
 * written. Matching only `(max-width:`/`(min-width:` leaves MEDIA QUERIES LEVEL 4
 * RANGE SYNTAX (`@media (width <= 639px)`, `@media (400px < width)`)
 * unrecognised, so a block banded away above every real screen reads as applying
 * at every width.
 */
export const WIDTH_CONDITIONED =
  /\(\s*(?:(?:max|min)-width\s*:|width\s*[<>=]|[\d.]+(?:px|r?em|ch|ex|vw|vh|vmin|vmax)\s*[<>=])/;

/** Whether a rule at this context applies at EVERY viewport width. */
export function appliesAtEveryWidth(context: readonly string[]): boolean {
  return !context.some((at) => WIDTH_CONDITIONED.test(at));
}

/**
 * The rules that apply at EVERY viewport width.
 *
 * This is the right universe for a PRESENCE assertion — "the shared ring exists",
 * "something is flattened" — because a rule that only applies above 2000 px is
 * exactly as absent as no rule at all.
 *
 * It is the WRONG universe for an OFFENCE hunt: a rule that only applies below
 * 640 px is not absent, it is present on every phone. The filter therefore sits
 * here, applied per assertion, rather than inside the reader where it would
 * silently apply to both.
 */
export function everywhere<T extends { readonly context: readonly string[] }>(rules: T[]): T[] {
  return rules.filter((rule) => appliesAtEveryWidth(rule.context));
}

/** One `prop: value` declaration, lowercased so spelling case cannot hide it. */
export interface Declaration {
  readonly property: string;
  readonly value: string;
}

/** The declarations of a block, in source order. */
export function declarationsOf(body: string): Declaration[] {
  return body
    .split(';')
    .map((one) => one.trim())
    .filter((one) => one !== '')
    .flatMap((one) => {
      const colon = one.indexOf(':');
      if (colon === -1) return [];
      return [
        {
          property: one.slice(0, colon).trim().toLowerCase(),
          value: one
            .slice(colon + 1)
            .trim()
            .toLowerCase(),
        },
      ];
    });
}
