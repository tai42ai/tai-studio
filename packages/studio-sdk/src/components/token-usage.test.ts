/**
 * Static gates over the whole monorepo's use of the design-system token contract.
 *
 * 1. Every `var(--tai-*)` written anywhere under `packages/` or `apps/` names a token
 *    the design system actually defines. An undefined token resolves to nothing, which
 *    is invisible in review and silently ships an unstyled control — five of them were
 *    live before this contract existed.
 * 2. `--tai-color-decor` never lands on a `color:` declaration. It is the NON-TEXT tier
 *    (dividers, watermarks, decorative SVG fill/stroke) and sits below the text contrast
 *    floor, so as text it is a WCAG failure by construction.
 * 3. `TOKEN_NAMES` — the published plugin styling API — and the declarations in
 *    `tokens.css` are the same set, in both directions.
 * 4. Every token carrying a literal color states BOTH themes, as a `light-dark()` pair
 *    with two different values. A single-valued color token is a dark-mode bug that
 *    renders correctly in the light theme and so survives review; the handful that are
 *    deliberately the same ink in both themes are named below.
 *
 * The scan is source-level on purpose: it sees the JSX inline styles and the stylesheets
 * alike, and it needs no build.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TOKEN_NAMES } from './tokens';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(packageRoot, '../..');
const scanRoots = [resolve(repoRoot, 'packages'), resolve(repoRoot, 'apps')];
const tokenStylesheet = resolve(packageRoot, 'src/components/tokens.css');
const stylesheets = [tokenStylesheet, resolve(packageRoot, 'src/components/components.css')];

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.css'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.turbo']);

/** Every scannable source file below `dir`, recursively. */
function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) found.push(...sourceFiles(join(dir, entry.name)));
    } else if (SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      found.push(join(dir, entry.name));
    }
  }
  return found;
}

/** The single capture of a match, or a loud failure if the pattern ever loses it. */
function captured(match: RegExpMatchArray): string {
  const group = match[1];
  if (group === undefined) throw new Error(`Pattern matched without a capture: ${match[0]}`);
  return group;
}

/** The token names the design system declares, read from its stylesheets. */
function definedTokens(): ReadonlySet<string> {
  const defined = new Set<string>();
  for (const stylesheet of stylesheets) {
    for (const match of readFileSync(stylesheet, 'utf8').matchAll(/^\s*(--tai-[\w-]+)\s*:/gm)) {
      defined.add(captured(match));
    }
  }
  return defined;
}

/** Any hex or `rgb()`/`rgba()` literal, in a declaration or nested in a function. */
const LITERAL_COLOR = /#[0-9a-f]{3,8}\b|rgba?\(/i;

/**
 * Tokens whose ink is deliberately IDENTICAL in both themes. `on-fill` is the
 * label on a filled semantic chip: the fills are light enough in either theme
 * that only the dark ink clears the contrast floor on both.
 */
const THEME_INVARIANT_COLOR_TOKENS = new Set(['--tai-color-on-fill']);

/**
 * The two arguments of the `light-dark()` call inside `value`, or `undefined`
 * when there is none. Scanned with a paren depth counter rather than a regex
 * because either argument may itself be a function call (`rgb(0 0 0 / 0.45)`).
 */
function lightDarkArguments(value: string): { light: string; dark: string } | undefined {
  const start = value.indexOf('light-dark(');
  if (start === -1) return undefined;

  let depth = 0;
  let comma = -1;
  for (let index = start + 'light-dark('.length - 1; index < value.length; index++) {
    const character = value[index];
    if (character === '(') depth++;
    else if (character === ')') {
      depth--;
      if (depth === 0) {
        if (comma === -1) return undefined;
        return {
          light: value.slice(start + 'light-dark('.length, comma).trim(),
          dark: value.slice(comma + 1, index).trim(),
        };
      }
    } else if (character === ',' && depth === 1) comma = index;
  }
  return undefined;
}

/** Every reference to the decor token, in a stylesheet or a JSX inline style. */
const DECOR_REFERENCE = /var\(\s*--tai-color-decor/g;

/**
 * The property a declaration's value belongs to: the last `name:` before the
 * value, with no statement boundary in between. Written as a backwards search
 * rather than a forward `property: value` match so that a value containing its
 * own commas and parentheses — `linear-gradient(90deg, …)`, or the next entry of
 * a JSX style object — cannot make the scan attribute the value to the wrong
 * property or miss it entirely.
 */
function governingProperty(source: string, valueIndex: number): string | undefined {
  const match = /([-A-Za-z][\w-]*)\s*:\s*[^;{}:]*$/.exec(source.slice(0, valueIndex));
  return match?.[1];
}

/**
 * `--tai-color-decor` is the NON-TEXT tier — it sits below the text contrast
 * floor, so as text or as a focus indicator it is a WCAG failure by
 * construction. The gate is a WHITELIST of the declarations it may appear on, so
 * a property nobody thought of (`caret-color`, `-webkit-text-fill-color`,
 * `text-decoration-color`) fails rather than slipping through an enumeration of
 * the forbidden ones.
 */
function decorIsAllowedOn(property: string): boolean {
  // JSX writes `borderLeft`; CSS writes `border-left`. One spelling to test.
  const kebab = property.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return (
    kebab === 'background' ||
    kebab.startsWith('background-') ||
    kebab === 'border' ||
    kebab.startsWith('border-') ||
    kebab === 'column-rule' ||
    kebab.startsWith('column-rule-') ||
    kebab === 'box-shadow' ||
    kebab === 'fill' ||
    kebab === 'stroke'
  );
}

/**
 * The properties in `source` that put `--tai-color-decor` somewhere it may not
 * go, in the order they appear. A reference whose property cannot be read at all
 * is reported too — an unattributable declaration is a hole in the gate, not a
 * pass.
 */
function decorOffences(source: string): string[] {
  const offences: string[] = [];
  for (const match of source.matchAll(DECOR_REFERENCE)) {
    const property = governingProperty(source, match.index);
    if (property === undefined) {
      offences.push('<no property found>');
    } else if (!decorIsAllowedOn(property)) {
      offences.push(property);
    }
  }
  return offences;
}

// This file spells the forbidden declarations out in order to document them, so it
// excludes itself from its own scan.
const selfPath = fileURLToPath(import.meta.url);
const files = scanRoots.flatMap(sourceFiles).filter((file) => file !== selfPath);

describe('design-system token usage', () => {
  it('scans the whole monorepo (a scan that found nothing would pass vacuously)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(definedTokens().size).toBeGreaterThan(50);
  });

  it('resolves every referenced var(--tai-*) to a defined token', () => {
    const defined = definedTokens();
    const unresolved: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/var\(\s*(--tai-[\w-]+)/g)) {
        const token = captured(match);
        if (!defined.has(token)) unresolved.push(`${relative(repoRoot, file)}: ${token}`);
      }
    }

    expect(unresolved).toEqual([]);
  });

  it('declares exactly the tokens TOKEN_NAMES documents, and no others', () => {
    // `TOKEN_NAMES` is the published plugin styling API. A name in the list that
    // the stylesheet never declares documents a token that resolves to nothing;
    // a declared token missing from the list is undiscoverable to a plugin.
    const declared = new Set(
      [...readFileSync(tokenStylesheet, 'utf8').matchAll(/^\s*(--tai-[\w-]+)\s*:/gm)].map(captured),
    );

    expect([...declared].sort()).toEqual([...TOKEN_NAMES].sort());
  });

  it('states both themes for every token carrying a literal color', () => {
    const declarations = readFileSync(tokenStylesheet, 'utf8').matchAll(
      /^\s*(--tai-[\w-]+)\s*:\s*([^;]+);/gm,
    );
    const offenders: string[] = [];

    for (const declaration of declarations) {
      const name = captured(declaration);
      const value = declaration[2]?.trim() ?? '';
      if (!LITERAL_COLOR.test(value)) continue;
      if (THEME_INVARIANT_COLOR_TOKENS.has(name)) continue;

      const pair = lightDarkArguments(value);
      if (pair === undefined) {
        offenders.push(`${name}: not a light-dark() pair`);
      } else if (pair.light === pair.dark) {
        offenders.push(`${name}: both themes are ${pair.light}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  describe('--tai-color-decor stays off every text-painting declaration', () => {
    it('flags exactly the forbidden properties in a hand-written sample', () => {
      // The POSITIVE CONTROL for the scan below. Without it, a pattern that
      // stopped matching would turn this gate green rather than red, and the
      // repo-wide scan cannot tell "no offenders" from "no longer looking".
      const sample = [
        // Forbidden: each of these paints text, or the focus indicator.
        'color: var(--tai-color-decor);',
        'caret-color: var(--tai-color-decor);',
        'text-decoration-color: var(--tai-color-decor);',
        '-webkit-text-fill-color: var(--tai-color-decor);',
        'outline-color: var(--tai-color-decor);',
        'text-shadow: 0 1px var(--tai-color-decor);',
        // The JSX inline-style spellings of the same declarations.
        "{ background: '#fff', color: 'var(--tai-color-decor)' }",
        "{ caretColor: 'var(--tai-color-decor)' }",
        "{ WebkitTextFillColor: 'var(--tai-color-decor)' }",
        // Allowed: the non-text tier — lines, grounds, decorative SVG.
        'border-color: var(--tai-color-decor);',
        'border-left: 1px solid var(--tai-color-decor);',
        'background: linear-gradient(90deg, var(--tai-color-decor), transparent);',
        'fill: var(--tai-color-decor);',
        'stroke: var(--tai-color-decor);',
        "{ borderLeft: '1px solid var(--tai-color-decor)' }",
      ].join('\n');

      // Each offence is reported under the property AS WRITTEN, so the CSS and
      // the JSX spellings of the same mistake stay distinguishable in a failure.
      expect(decorOffences(sample)).toEqual([
        'color',
        'caret-color',
        'text-decoration-color',
        '-webkit-text-fill-color',
        'outline-color',
        'text-shadow',
        'color',
        'caretColor',
        'WebkitTextFillColor',
      ]);
    });

    it('never lands on one anywhere under packages/ or apps/', () => {
      const offenders: string[] = [];

      for (const file of files) {
        for (const property of decorOffences(readFileSync(file, 'utf8'))) {
          offenders.push(`${relative(repoRoot, file)}: ${property}`);
        }
      }

      expect(offenders).toEqual([]);
    });
  });
});
