/**
 * Static gates over the whole monorepo's use of the design-system token contract.
 *
 * 1. Every `var(--tai-*)` written anywhere under `packages/`, `apps/` or `e2e/` names a token
 *    the design system actually defines. An undefined token resolves to nothing, which
 *    is invisible in review and silently ships an unstyled control — five of them were
 *    live before this contract existed.
 * 2. `--tai-color-decor` never lands on a `color:` declaration. It is the NON-TEXT tier
 *    (dividers, watermarks, decorative SVG fill/stroke) and sits below the text contrast
 *    floor, so as text it is a WCAG failure by construction.
 * 3. `TOKEN_NAMES` — the published plugin styling API — and the declarations in
 *    `tokens.css` are the same set, in both directions, once the `--tai-dark-*` storage
 *    half of each themed pair is set aside (it is mechanism, not API).
 * 4. THE THEME MECHANISM. The light value is the token and the dark value sits beside it
 *    under a `--tai-dark-` name; two blocks put the dark half into service — one keyed on
 *    `prefers-color-scheme`, one on a `data-theme="dark"` pin. The gates below hold that
 *    shape: every theme-varying token has both halves, the two blocks carry the SAME token
 *    set and no values of their own, no dark value is read from anywhere else, none sits
 *    dead, and `light-dark()` — which would fold each pair onto one line at the cost of a
 *    Chrome 123 / Firefox 120 / Safari 17.5 floor — is banned outright.
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
// `e2e/` is in the sweep for the reference plugin: it is the repo's one real
// plugin and the worked example of the published styling API, so a token it
// names that the design system does not define is the exact failure a plugin
// author would hit. Leaving it out made the header's "whole monorepo" a claim
// about two thirds of it. `dist`/`node_modules` are skipped below as everywhere.
const scanRoots = [
  resolve(repoRoot, 'packages'),
  resolve(repoRoot, 'apps'),
  resolve(repoRoot, 'e2e'),
];
const tokenStylesheet = resolve(packageRoot, 'src/components/tokens.css');

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

/**
 * Every stylesheet the design system ships, DISCOVERED rather than listed. A
 * hand-written list is a gate hole with a delay fuse: a fourth sheet added
 * beside these would be read by nothing here, and the `light-dark()` ban below
 * would pass over it. `fonts.css` and the shell's own `styles.css` are inside
 * the sweep for exactly that reason.
 */
const stylesheets = scanRoots
  .flatMap(sourceFiles)
  .filter((file) => file.endsWith('.css'))
  .sort();

/**
 * The token file with its comments stripped, because everything below parses it
 * by counting braces. The header explains the theme mechanism in prose, and an
 * unbalanced `}` inside a comment would silently truncate whichever block was
 * being read — turning a real gate into an empty list. The sibling scanners
 * (`focus-ring`, `reduced-motion`) strip first for the same reason.
 */
const TOKENS_CSS = withoutComments(readFileSync(tokenStylesheet, 'utf8'));

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

/** `source` with its block comments removed, so prose can never read as code. */
function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
}

/**
 * The CSS named colours. A keyword is as literal a colour as a hex triplet, and
 * `--tai-color-x: rebeccapurple` is exactly as much a dark-mode bug — so the
 * literal scan has to know them by name, not just by notation.
 */
const NAMED_COLORS = [
  'aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue',
  'blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk',
  'crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgrey|darkgreen|darkkhaki',
  'darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen',
  'darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue',
  'dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite',
  'gold|goldenrod|gray|grey|green|greenyellow|honeydew|hotpink|indianred|indigo|ivory|khaki',
  'lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan',
  'lightgoldenrodyellow|lightgray|lightgrey|lightgreen|lightpink|lightsalmon|lightseagreen',
  'lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen',
  'magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen',
  'mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream',
  'mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid',
  'palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum',
  'powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown',
  'seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen',
  'steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow',
  'yellowgreen',
].join('|');

/**
 * A colour written out rather than referenced, in ANY notation CSS accepts: hex,
 * the legacy and modern function forms, the CIE/OKLab families, `color()`,
 * `color-mix()`, and the named keywords. Matching only `#rgb` and `rgb(` — which
 * this pattern did first — let `oklch()`, `hsl()` and `rebeccapurple` past the
 * both-themes gate below, which is the one thing it exists to catch.
 */
const LITERAL_COLOR = new RegExp(
  [
    '#[0-9a-f]{3,8}\\b',
    '(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\\s*\\(',
    `\\b(?:${NAMED_COLORS})\\b`,
  ].join('|'),
  'i',
);

/**
 * Tokens whose ink is deliberately IDENTICAL in both themes. `on-fill` is the
 * label on a filled semantic chip: the fills are light enough in either theme
 * that only the dark ink clears the contrast floor on both.
 */
const THEME_INVARIANT_COLOR_TOKENS = new Set(['--tai-color-on-fill']);

/** Tokens whose value is authored per theme, matched by name. */
const THEME_VARYING = /^--tai-(?:color|shadow)-/;

/** The name a theme-varying token's dark half is authored under, beside it. */
function darkCounterpart(token: string): string {
  return token.replace(/^--tai-/, '--tai-dark-');
}

/** The media query that applies the dark half to a root not pinned to light. */
const DARK_MEDIA =
  /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)\s*\{/;
/** The block that applies the dark half to a root explicitly pinned to dark. */
const DARK_PINNED = /:root\[data-theme='dark'\]\s*\{/;
/** The plain `:root` block — the declarations that apply at every theme. */
const BASE_ROOT = /(?:^|\n)\s*:root\s*\{/;

/**
 * The body of a rule in `tokens.css`, found by its opening pattern, with nested
 * blocks kept. A missing rule throws rather than yielding an empty body, so a
 * selector edited out of step with this file fails loudly instead of silently
 * emptying every assertion that reads it.
 */
function ruleRange(pattern: RegExp): { readonly start: number; readonly end: number } {
  const opening = pattern.exec(TOKENS_CSS);
  if (opening === null) throw new Error(`tokens.css has no rule matching ${pattern.source}`);
  let depth = 1;
  let end = opening.index + opening[0].length;
  while (depth > 0) {
    const character = TOKENS_CSS[end];
    if (character === undefined) throw new Error(`the ${pattern.source} block is unterminated`);
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    end += 1;
  }
  return { start: opening.index + opening[0].length, end: end - 1 };
}

function ruleBody(pattern: RegExp): string {
  const { start, end } = ruleRange(pattern);
  return TOKENS_CSS.slice(start, end);
}

/** `token: value` for every custom property a block declares, in order. */
function declarationsIn(body: string): readonly (readonly [string, string])[] {
  return [...body.matchAll(/^\s*(--tai-[\w-]+)\s*:\s*([^;]+);/gm)].map(
    (match) => [captured(match), (match[2] ?? '').trim()] as const,
  );
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
    // a declared token missing from the list is undiscoverable to a plugin. The
    // `--tai-dark-*` half of each pair is the theme mechanism's own storage, not
    // API — the assertions below are what hold it to that.
    const declared = new Set(
      [...TOKENS_CSS.matchAll(/^\s*(--tai-[\w-]+)\s*:/gm)]
        .map(captured)
        .filter((token) => !token.startsWith('--tai-dark-')),
    );

    expect([...declared].sort()).toEqual([...TOKEN_NAMES].sort());
  });

  describe('the theme mechanism', () => {
    it('gives every theme-varying token both halves, side by side', () => {
      // A single-valued colour token is a dark-mode bug that renders correctly in
      // the light theme and so survives review.
      const base = declarationsIn(ruleBody(BASE_ROOT));
      const values = new Map(base);
      const varying = base
        .map(([token]) => token)
        .filter((token) => THEME_VARYING.test(token) && !token.startsWith('--tai-dark-'));
      // The pattern is the whole selection; one edited out of step with the token
      // names would leave every assertion below reading an empty list.
      expect(varying.length).toBeGreaterThan(25);

      const missing = varying
        // A derived token — the focus ring, the placeholder, the syntax colours,
        // the disabled grounds — reads another token and follows it into either
        // theme, so it needs no dark half of its own.
        .filter((token) => !(values.get(token) ?? '').includes('var('))
        .filter((token) => !THEME_INVARIANT_COLOR_TOKENS.has(token))
        .filter((token) => !values.has(darkCounterpart(token)))
        .map((token) => `${token} has no ${darkCounterpart(token)}`);

      expect(missing).toEqual([]);
    });

    it('states both themes for every token carrying a literal colour', () => {
      // The name-based check above misses a colour hiding under a name that does
      // not read as one; this one is keyed on the VALUE, so it catches that too.
      const values = new Map(declarationsIn(ruleBody(BASE_ROOT)));
      const offenders = [...values]
        .filter(([token]) => !token.startsWith('--tai-dark-'))
        .filter(([token]) => !THEME_INVARIANT_COLOR_TOKENS.has(token))
        .filter(([, value]) => LITERAL_COLOR.test(value))
        .filter(([token]) => !values.has(darkCounterpart(token)))
        .map(([token, value]) => `${token}: ${value}`);

      expect(offenders).toEqual([]);

      // Positive controls: the notations this pattern used to miss entirely.
      for (const value of ['oklch(62% 0.2 25)', 'hsl(348 83% 47%)', 'rebeccapurple', '#dc143c']) {
        expect([value, LITERAL_COLOR.test(value)]).toEqual([value, true]);
      }
      // …and values that are NOT colours must not trip it, or every token would
      // be demanded a dark half and the list above would stop meaning anything.
      for (const value of ['0.75rem', '999px', 'var(--tai-color-accent)', '0 12px 32px']) {
        expect([value, LITERAL_COLOR.test(value)]).toEqual([value, false]);
      }
    });

    it('writes every colour exactly once', () => {
      // A raw value belongs in the base `:root` block and nowhere else. The two
      // blocks that apply the dark half only re-point a token at its
      // `--tai-dark-*` neighbour, so no light/dark pair is ever restated where
      // the two halves could drift apart.
      for (const [name, pattern] of [
        ['the dark media query', DARK_MEDIA],
        ['the pinned-dark block', DARK_PINNED],
      ] as const) {
        const restated = declarationsIn(ruleBody(pattern))
          .filter(([token, value]) => value !== `var(${darkCounterpart(token)})`)
          .map(([token, value]) => `${token}: ${value}`);
        expect([name, restated]).toEqual([name, []]);
      }
    });

    it('applies the dark half identically however the theme is chosen', () => {
      // One block answers the operating system, the other an explicit choice. A
      // token re-pointed under one and forgotten under the other would take the
      // dark half for OS-dark readers and keep the light half for pinned ones.
      const media = declarationsIn(ruleBody(DARK_MEDIA));
      const pinned = declarationsIn(ruleBody(DARK_PINNED));
      expect(media.length).toBeGreaterThan(25);
      expect(pinned).toEqual(media);
    });

    it('never puts a dark value into service by any other route', () => {
      // Every `--tai-dark-*` token exists to be read by the two blocks above. One
      // read anywhere else — a component reaching past the theme, a base
      // declaration wired to the wrong half — would ignore the reader's theme.
      // Scoped by CHARACTER OFFSET. Collecting the names the dark blocks re-point
      // and allowing those names everywhere would be a tautology, since every dark
      // token IS re-pointed. Matching on the line's TEXT is barely better and was
      // the shape this had first: a base-`:root` declaration wired to its own dark
      // half — `--tai-color-bg: var(--tai-dark-color-bg);` in the light theme — is
      // byte-identical to a line inside both dark blocks, so the filter dropped
      // the one live bug it exists to catch. Only WHERE the read sits can decide.
      const darkRanges = [ruleRange(DARK_MEDIA), ruleRange(DARK_PINNED)];
      const readsOutsideTheDarkBlocks = (
        source: string,
        ranges: readonly { readonly start: number; readonly end: number }[],
      ): readonly string[] =>
        [...source.matchAll(/^.*var\(\s*--tai-dark-[\w-]+.*$/gm)]
          .filter(({ index }) => !ranges.some(({ start, end }) => index >= start && index < end))
          .map((match) => match[0].trim());

      // No consumer anywhere may reach past the theme for a dark value at all.
      // The token file itself is excluded here and checked by LOCATION below.
      const strayInConsumers: string[] = [];
      for (const file of files.filter((file) => file !== tokenStylesheet)) {
        for (const match of readFileSync(file, 'utf8').matchAll(/var\(\s*(--tai-dark-[\w-]+)/g)) {
          strayInConsumers.push(`${relative(repoRoot, file)}: ${captured(match)}`);
        }
      }
      expect(strayInConsumers).toEqual([]);
      // …and inside the token file itself, every read must sit in one of the two
      // blocks — a base declaration wired to the wrong half is the live-bug shape.
      expect(readsOutsideTheDarkBlocks(TOKENS_CSS, darkRanges)).toEqual([]);

      // Positive controls, both keyed on the shape that actually ships. The first
      // is a line that ALSO appears verbatim inside both dark blocks — the case a
      // text-based filter laundered — so it proves the scan judges position.
      const strayInBaseRoot = '  --tai-color-bg: var(--tai-dark-color-bg);';
      expect(readsOutsideTheDarkBlocks(strayInBaseRoot, darkRanges)).toEqual([
        '--tai-color-bg: var(--tai-dark-color-bg);',
      ]);
      expect(ruleBody(DARK_MEDIA)).toContain(strayInBaseRoot.trim());
      // …and the SAME text is NOT flagged once its offset falls inside a block:
      // one line, two positions, two verdicts. That opposite direction is what
      // makes the pair discriminate. A range grown to swallow the base `:root`
      // fails the control above, because the stray's offset would land inside
      // it; a range that no longer covers its block fails here.
      //
      // Both halves are judged against the REAL `darkRanges`. Handing this one a
      // synthetic `[{start: 0, end: strayText.length}]` — which it did first —
      // made it a test of the range ARITHMETIC and nothing else: no edit to
      // `ruleRange`, `DARK_MEDIA` or `DARK_PINNED` could reach it. So the stray
      // is spliced into a COPY of the token file instead, on its own line at the
      // foot of the pinned-dark block, where the offset it lands at is one the
      // ranges above have to actually cover.
      const pinned = ruleRange(DARK_PINNED);
      const insertAt = TOKENS_CSS.lastIndexOf('\n', pinned.end) + 1;
      expect(insertAt).toBeGreaterThan(pinned.start);
      expect(insertAt).toBeLessThan(pinned.end);
      const strayInsideADarkBlock =
        TOKENS_CSS.slice(0, insertAt) + `${strayInBaseRoot}\n` + TOKENS_CSS.slice(insertAt);
      expect(readsOutsideTheDarkBlocks(strayInsideADarkBlock, darkRanges)).toEqual([]);

      // …and every dark value authored is actually applied, so none sits dead.
      const applied = new Set(
        [ruleBody(DARK_MEDIA), ruleBody(DARK_PINNED)].flatMap((body) =>
          declarationsIn(body).map(([token]) => darkCounterpart(token)),
        ),
      );
      const authored = declarationsIn(ruleBody(BASE_ROOT))
        .map(([token]) => token)
        .filter((token) => token.startsWith('--tai-dark-'));
      expect(authored.filter((token) => !applied.has(token))).toEqual([]);
    });

    it('raises no browser floor to express a theme', () => {
      // `light-dark()` would fold each pair onto one line, but it is invalid at
      // computed-value time below Chrome 123 / Firefox 120 / Safari 17.5, and
      // since every themed token would use it the whole palette drops out at once
      // below that line — text on text, not an unstyled page. These sheets ship as
      // authored, so nothing lowers it away. Comments are stripped first: the token
      // file names the function to explain why it is not used, and that sentence
      // must not read as a use of it.
      const raised = stylesheets
        .filter((sheet) => /light-dark\s*\(/.test(withoutComments(readFileSync(sheet, 'utf8'))))
        .map((sheet) => relative(repoRoot, sheet));
      expect(raised).toEqual([]);
      // Positive control: the ban has to be able to fire.
      expect(/light-dark\s*\(/.test(withoutComments('a { color: light-dark(#fff, #000); }'))).toBe(
        true,
      );

      // The floor these sheets DO set is declared rather than left implicit.
      const declared = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
        browserslist?: readonly string[];
      };
      expect(declared.browserslist).toEqual(
        expect.arrayContaining(['chrome >= 99', 'firefox >= 97', 'safari >= 15.4']),
      );
    });
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

    it('never lands on one anywhere under packages/, apps/ or e2e/', () => {
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
