/**
 * Static gates over the whole monorepo's use of the design-system token contract.
 *
 * 1. Every `var(--tai-*)` written anywhere under `packages/`, `apps/` or `e2e/` names a token
 *    `tokens.css` — the one sheet that declares the contract — actually defines. An
 *    undefined token resolves to nothing, which is invisible in review and silently ships
 *    an unstyled control — five of them were live before this contract existed. The
 *    resolver reads that ONE sheet, and a second gate holds every other sheet to declaring
 *    none: a definition unioned in from the app shell, or from the checked-in e2e build
 *    artifact, would resolve an SDK component's token from outside the SDK and keep this
 *    gate green while the published package shipped a token nothing defines.
 * 2. `--tai-color-decor` never lands on a `color:` declaration. It is the NON-TEXT tier
 *    (dividers, watermarks, decorative SVG fill/stroke) and sits below the text contrast
 *    floor, so as text it is a WCAG failure by construction.
 * 3. `TOKEN_NAMES` — the published plugin styling API — and the declarations in
 *    `tokens.css` are the same set, in both directions, once the `--tai-dark-*` storage
 *    half of each themed pair is set aside (it is mechanism, not API). The VALUES behind
 *    those names are pinned too: a token that keeps its name and changes its value ships
 *    a different design system under an unchanged API, and nothing else here notices.
 * 4. THE THEME MECHANISM. The light value is the token and the dark value sits beside it
 *    under a `--tai-dark-` name; two blocks put the dark half into service — one keyed on
 *    `prefers-color-scheme`, one on a `data-theme="dark"` pin. The gates below hold that
 *    shape: every theme-varying token has both halves, the two blocks carry the SAME token
 *    set and no values of their own, no dark value is read from anywhere else, none sits
 *    dead, and `light-dark()` — which would fold each pair onto one line at the cost of a
 *    Chrome 123 / Firefox 120 / Safari 17.5 floor — is banned outright. Which blocks may
 *    carry a value is decided by ENUMERATING THE SHEET rather than by naming the two dark
 *    blocks: `:root[data-theme='light']` is a real block in this file that no named
 *    pattern reached, so a colour restated there was checked by nothing while the
 *    identical edit one block lower went red.
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

/**
 * The token names the design system declares, read from `tokens.css` ALONE.
 *
 * Unioning every discovered sheet — which this did first — makes any sheet in the
 * repository a definition site: an SDK component referencing a token declared only in the
 * app shell's own sheet, or only in the checked-in e2e build artifact, resolved and the
 * gate stayed green, while the published package shipped a `var()` nothing defines. The
 * declarations are read from the COMMENT-STRIPPED text, so a token named in the prose
 * that explains the theme mechanism cannot define one either.
 */
function definedTokens(): ReadonlySet<string> {
  return new Set([...TOKENS_CSS.matchAll(/^\s*(--tai-[\w-]+)\s*:/gm)].map(captured));
}

/** `sheet: --token` for every custom property under the DS namespace a sheet declares. */
function tokensDeclaredIn(stylesheet: string): string[] {
  const source = withoutComments(readFileSync(stylesheet, 'utf8'));
  return [...source.matchAll(/^\s*(--tai-[\w-]+)\s*:/gm)].map(
    (match) => `${relative(repoRoot, stylesheet)}: ${captured(match)}`,
  );
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

/**
 * The at-rule preludes enclosing `offset` in `tokens.css`, outermost first.
 *
 * A block's ROLE is decided by where it sits as much as by its selector: the same
 * `:root { --tai-motion-fast: … }` is the authoring block at the top level and the
 * reduced-motion override inside its query. Blocks that are not at-rules are pushed as
 * `''` so the stack stays balanced and a rule nested two levels deep is still reached.
 */
function contextAt(offset: number): string[] {
  const stack: string[] = [];
  let prelude = '';
  for (let index = 0; index < offset; index++) {
    const character = TOKENS_CSS[index];
    if (character === '{') {
      const head = prelude.trim();
      prelude = '';
      stack.push(head.startsWith('@') ? head : '');
    } else if (character === '}') {
      stack.pop();
      prelude = '';
    } else {
      prelude += character ?? '';
    }
  }
  return stack.filter((head) => head !== '');
}

/** What a block in `tokens.css` is allowed to do with a custom property. */
type BlockRole =
  /** The base `:root`: the one block where a value is written. */
  | 'authoring'
  /** A block that puts the dark half into service: it may only RE-POINT. */
  | 'dark'
  /** The reduced-motion override: it may only ZERO a duration. */
  | 'reduced-motion'
  /** Anything else. It may carry no custom property at all. */
  | 'other';

interface TokenBlock {
  readonly selector: string;
  readonly role: BlockRole;
  readonly body: string;
}

function roleOf(selector: string, context: readonly string[]): BlockRole {
  const queries = context.filter((at) => at.startsWith('@media'));
  const under = (feature: RegExp): boolean => queries.some((at) => feature.test(at));
  if (under(/prefers-reduced-motion:\s*reduce/) && selector === ':root') return 'reduced-motion';
  if (under(/prefers-color-scheme:\s*dark/) && selector === ":root:not([data-theme='light'])") {
    return 'dark';
  }
  if (queries.length > 0) return 'other';
  if (selector === ":root[data-theme='dark']") return 'dark';
  if (selector === ':root') return 'authoring';
  return 'other';
}

/**
 * Every innermost block in `tokens.css` that declares a custom property, DISCOVERED
 * from the sheet and classified by its selector and its enclosing at-rules.
 *
 * Naming the blocks instead — `BASE_ROOT`, `DARK_MEDIA`, `DARK_PINNED` — checks only the
 * blocks somebody thought to name, and a sheet grows blocks: `:root[data-theme='light']`
 * is live in this file and was reached by none of them, so a literal colour restated
 * there was judged by nothing while the identical edit one block lower went red. Reading
 * the sheet makes an unrecognised block a failure rather than an omission.
 */
function customPropertyBlocks(): TokenBlock[] {
  return [...TOKENS_CSS.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
    .map((match) => {
      const selector = (match[1] ?? '').trim();
      return {
        selector,
        body: match[2] ?? '',
        role: roleOf(selector, contextAt(match.index)),
      };
    })
    .filter((block) => declarationsIn(block.body).length > 0);
}

/** A duration that has been zeroed, in either spelling. */
const ZERO_DURATION = /^0m?s$/;

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

/** px per `rem`, at the root font size these sheets are written against. */
const ROOT_FONT_PX = 16;

/** `--token: value` for every custom property the base `:root` authors, in order. */
function authoredValues(): string[] {
  return declarationsIn(ruleBody(BASE_ROOT)).map(
    ([token, value]) => `${token}: ${value.replaceAll(/\s+/g, ' ').trim()}`,
  );
}

/**
 * Every token authored in `rem` whose comment states the px it renders at, as
 * `[token, declared rem, documented px]`.
 *
 * The type and spacing scales carry their rendered px beside them, and that comment is
 * what a reader designs against. Read as documentation it is a second statement of the
 * same value, so the two are reconciled below rather than left to drift into a comment
 * describing a size the sheet stopped declaring. Read from the sheet WITH its comments,
 * for obvious reasons.
 */
function remTokensWithDocumentedPx(): [string, number, number][] {
  return [
    ...readFileSync(tokenStylesheet, 'utf8').matchAll(
      /(--tai-[\w-]+):\s*([\d.]+)rem;\s*\/\*\s*([\d.]+)px/g,
    ),
  ].map(([, token, rem, px]) => [token ?? '', Number(rem), Number(px)]);
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
 * A border property that paints ONE edge — a rule or a divider — rather than the
 * closed boundary that says "this is a control".
 *
 * Physical (`border-left`) and logical (`border-inline-start`) spellings alike, with or
 * without the `-color`/`-width`/`-style` sub-property. `border` and `border-color` are
 * NOT here: they paint all four edges at once.
 */
const SINGLE_EDGE_BORDER =
  /^border-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?(?:-(?:color|width|style))?$/;

/**
 * `--tai-color-decor` is the NON-TEXT tier — it sits below the text contrast
 * floor, so as text or as a focus indicator it is a WCAG failure by
 * construction. The gate is a WHITELIST of the declarations it may appear on, so
 * a property nobody thought of (`caret-color`, `-webkit-text-fill-color`,
 * `text-decoration-color`) fails rather than slipping through an enumeration of
 * the forbidden ones.
 *
 * The tier has a SECOND clause — a decorative token is never a component's identifying
 * boundary — and allowing `border` and every `border-*` outright enforced none of it:
 * `border: 1px solid var(--tai-color-decor)` on an input draws that input's whole
 * outline below 3:1, which is the contrast failure the contrast-safe
 * `--tai-color-control-border` exists to prevent. So the allowance is narrowed to the
 * edge-painting spellings — a divider, a gutter rule, the JSON tree's indent guide —
 * and the four-edge shorthands are refused.
 */
function decorIsAllowedOn(property: string): boolean {
  // JSX writes `borderLeft`; CSS writes `border-left`. One spelling to test.
  const kebab = property.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return (
    kebab === 'background' ||
    kebab.startsWith('background-') ||
    SINGLE_EDGE_BORDER.test(kebab) ||
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

  it('declares the contract in ONE sheet, so nothing defines a token beside it', () => {
    // The other half of reading `tokens.css` alone. A `--tai-*` declared in another
    // sheet is a second definition site: it is not in `TOKEN_NAMES`, no plugin can
    // discover it, and it resolves only for the hosts that happen to load that sheet.
    // A variable genuinely private to one component belongs under its own namespace,
    // not under the published one.
    const elsewhere = stylesheets
      .filter((stylesheet) => stylesheet !== tokenStylesheet)
      .flatMap(tokensDeclaredIn);
    expect(elsewhere).toEqual([]);
    // The reader really finds declarations — otherwise the sweep above is vacuous.
    expect(tokensDeclaredIn(tokenStylesheet).length).toBeGreaterThan(100);
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

    it('writes every colour exactly once, in the one block that authors values', () => {
      // A raw value belongs in the base `:root` block and nowhere else. The two
      // blocks that apply the dark half only re-point a token at its
      // `--tai-dark-*` neighbour, so no light/dark pair is ever restated where
      // the two halves could drift apart; the reduced-motion block only zeroes a
      // duration. Every OTHER block in the sheet may carry no custom property at
      // all — which is what puts `:root[data-theme='light']` under the rule.
      const blocks = customPropertyBlocks();
      // The three roles above, and nothing has silently stopped parsing.
      expect(blocks.length).toBeGreaterThanOrEqual(4);
      expect(blocks.filter((block) => block.role === 'authoring')).toHaveLength(1);
      expect(blocks.filter((block) => block.role === 'dark')).toHaveLength(2);

      const restated: string[] = [];
      for (const block of blocks) {
        if (block.role === 'authoring') continue;
        for (const [token, value] of declarationsIn(block.body)) {
          if (block.role === 'dark' && value === `var(${darkCounterpart(token)})`) continue;
          if (block.role === 'reduced-motion' && ZERO_DURATION.test(value)) continue;
          restated.push(`${block.selector}: ${token}: ${value}`);
        }
      }
      expect(restated).toEqual([]);
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

      // The floor these sheets DO set is declared rather than left implicit, and it is
      // pinned as the WHOLE list. `arrayContaining` only asks that the pinned entries are
      // present, so a looser one beside them — `chrome >= 60`, `safari >= 12` — lowers
      // the real floor to the loosest query in the list while every named entry still
      // matches. What ships is the union, so the union is what is asserted.
      const declared = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
        browserslist?: readonly string[];
      };
      expect(declared.browserslist).toEqual([
        'chrome >= 99',
        'edge >= 99',
        'firefox >= 97',
        'safari >= 15.4',
        'ios_saf >= 15.4',
      ]);
    });
  });

  describe('the values behind the names', () => {
    // `TOKEN_NAMES` and the gate above pin the token LIST. A token that keeps its
    // name and changes its VALUE ships a different design system under the same
    // API — `--tai-text-xl` reading 1rem rather than 1.4375rem collapses the page
    // title onto body text with every name present, every reference resolving and
    // nothing red anywhere in the repository.

    it('reads the authoring block (a pin over an empty list would pass vacuously)', () => {
      expect(authoredValues().length).toBeGreaterThan(100);
      expect(remTokensWithDocumentedPx().length).toBeGreaterThan(10);
    });

    it('pins the VALUE behind every token, not merely its name', () => {
      // The list below IS the design system's declared values, in BOTH directions:
      // a kept name given a new value and a token declared with a value nobody
      // recorded fail here alike.
      expect(authoredValues()).toMatchInlineSnapshot(`
        [
          "--tai-color-bg: #ffffff",
          "--tai-dark-color-bg: #0c0e12",
          "--tai-color-surface: #f9fafb",
          "--tai-dark-color-surface: #12151b",
          "--tai-color-surface-raised: #ffffff",
          "--tai-dark-color-surface-raised: #171c24",
          "--tai-color-surface-disabled: var(--tai-color-surface)",
          "--tai-color-code-bg: #f3f4f6",
          "--tai-dark-color-code-bg: #10131a",
          "--tai-color-border: #e5e7eb",
          "--tai-dark-color-border: #262c36",
          "--tai-color-border-strong: #d1d5db",
          "--tai-dark-color-border-strong: #39414e",
          "--tai-color-control-border: #767c85",
          "--tai-dark-color-control-border: #646c79",
          "--tai-color-border-disabled: var(--tai-color-border)",
          "--tai-color-text: #111827",
          "--tai-dark-color-text: #e6e8ec",
          "--tai-color-heading: #000000",
          "--tai-dark-color-heading: #ffffff",
          "--tai-color-text-muted: rgba(17, 24, 39, 0.62)",
          "--tai-dark-color-text-muted: rgba(230, 232, 236, 0.64)",
          "--tai-color-text-disabled: rgba(17, 24, 39, 0.38)",
          "--tai-dark-color-text-disabled: rgba(230, 232, 236, 0.36)",
          "--tai-color-placeholder: var(--tai-color-text-muted)",
          "--tai-color-decor: rgba(17, 24, 39, 0.44)",
          "--tai-dark-color-decor: rgba(230, 232, 236, 0.42)",
          "--tai-color-accent: #dc143c",
          "--tai-dark-color-accent: #ed4c67",
          "--tai-color-accent-hover: #800020",
          "--tai-dark-color-accent-hover: #f4718a",
          "--tai-color-accent-on-tint: #be123c",
          "--tai-dark-color-accent-on-tint: #f4718a",
          "--tai-color-on-accent: #ffffff",
          "--tai-dark-color-on-accent: #0c0e12",
          "--tai-color-accent-tint: rgba(220, 20, 60, 0.08)",
          "--tai-dark-color-accent-tint: rgba(237, 76, 103, 0.12)",
          "--tai-color-ok-text: #047857",
          "--tai-dark-color-ok-text: #34d399",
          "--tai-color-err-text: #b91c1c",
          "--tai-dark-color-err-text: #f87171",
          "--tai-color-warn-text: #92400e",
          "--tai-dark-color-warn-text: #fbbf24",
          "--tai-color-ok-fill: #10b981",
          "--tai-dark-color-ok-fill: #34d399",
          "--tai-color-err-fill: #ef4444",
          "--tai-dark-color-err-fill: #f87171",
          "--tai-color-warn-fill: #d97706",
          "--tai-dark-color-warn-fill: #fbbf24",
          "--tai-color-ok-tint: rgba(16, 185, 129, 0.1)",
          "--tai-dark-color-ok-tint: rgba(52, 211, 153, 0.12)",
          "--tai-color-err-tint: rgba(239, 68, 68, 0.1)",
          "--tai-dark-color-err-tint: rgba(248, 113, 113, 0.12)",
          "--tai-color-warn-tint: rgba(217, 119, 6, 0.1)",
          "--tai-dark-color-warn-tint: rgba(251, 191, 36, 0.12)",
          "--tai-color-on-fill: #0c0e12",
          "--tai-color-focus-ring: var(--tai-color-accent)",
          "--tai-color-scrim: rgba(0, 0, 0, 0.45)",
          "--tai-dark-color-scrim: rgba(0, 0, 0, 0.6)",
          "--tai-color-prose-link: #dc143c",
          "--tai-dark-color-prose-link: #f4718a",
          "--tai-color-prose-link-hover: #800020",
          "--tai-dark-color-prose-link-hover: #ed4c67",
          "--tai-color-syntax-key: var(--tai-color-text-muted)",
          "--tai-color-syntax-string: var(--tai-color-ok-text)",
          "--tai-color-syntax-number: var(--tai-color-accent)",
          "--tai-color-syntax-bool: var(--tai-color-warn-text)",
          "--tai-color-primary: var(--tai-color-accent)",
          "--tai-color-primary-text: var(--tai-color-on-accent)",
          "--tai-color-danger: var(--tai-color-err-text)",
          "--tai-color-danger-text: #ffffff",
          "--tai-dark-color-danger-text: #0c0e12",
          "--tai-color-danger-hover: #7f1d1d",
          "--tai-dark-color-danger-hover: #fca5a5",
          "--tai-color-danger-surface: var(--tai-color-err-tint)",
          "--tai-color-success: var(--tai-color-ok-text)",
          "--tai-color-warning: var(--tai-color-warn-text)",
          "--tai-space-1: 0.25rem",
          "--tai-space-2: 0.5rem",
          "--tai-space-3: 0.75rem",
          "--tai-space-4: 1rem",
          "--tai-space-5: 1.25rem",
          "--tai-space-6: 1.5rem",
          "--tai-space-8: 2rem",
          "--tai-radius-sm: 4px",
          "--tai-radius-code: 6px",
          "--tai-radius-md: 8px",
          "--tai-radius-tile: 10px",
          "--tai-radius-lg: 12px",
          "--tai-radius-overlay: 14px",
          "--tai-radius-full: 999px",
          "--tai-font-sans: 'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          "--tai-font-mono: 'Geist Mono Variable', ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
          "--tai-text-display: 1.625rem",
          "--tai-text-xl: 1.4375rem",
          "--tai-text-section: 1.0625rem",
          "--tai-text-lg: 0.9375rem",
          "--tai-text-md: 0.84375rem",
          "--tai-text-sm: 0.78125rem",
          "--tai-text-code: 0.75rem",
          "--tai-text-xs: 0.6875rem",
          "--tai-control-height: 36px",
          "--tai-control-height-coarse: 44px",
          "--tai-motion-fast: 150ms",
          "--tai-motion-base: 250ms",
          "--tai-shadow-lift-color: rgb(0 0 0 / 0.08)",
          "--tai-dark-shadow-lift-color: rgb(0 0 0 / 0.45)",
          "--tai-shadow-overlay-color: rgb(0 0 0 / 0.16)",
          "--tai-dark-shadow-overlay-color: rgb(0 0 0 / 0.6)",
          "--tai-shadow-lift: 0 12px 32px var(--tai-shadow-lift-color)",
          "--tai-shadow-overlay: 0 24px 48px var(--tai-shadow-overlay-color)",
          "--tai-shadow-sm: var(--tai-shadow-lift)",
          "--tai-shadow-md: var(--tai-shadow-overlay)",
          "--tai-z-sticky: 10",
          "--tai-z-dropdown: 20",
          "--tai-z-overlay: 30",
          "--tai-z-dialog: 40",
          "--tai-z-popover: 45",
          "--tai-z-tooltip: 50",
        ]
      `);
    });

    it('renders each rem token at the px its own comment documents', () => {
      // The comment beside a type or spacing token is what a reader designs
      // against, so it is a second statement of the same value. Reconciling them
      // catches the half-edit — a value moved with the note left behind — that a
      // pin on either one alone reads as correct.
      const inconsistent = remTokensWithDocumentedPx()
        .filter(([, rem, px]) => rem * ROOT_FONT_PX !== px)
        .map(
          ([token, rem, px]) =>
            `${token}: ${String(rem)}rem is ${String(rem * ROOT_FONT_PX)}px, ` +
            `documented as ${String(px)}px`,
        );
      expect(inconsistent).toEqual([]);
    });

    it('keeps the type scale ordered, so a size never outranks the one above it', () => {
      // The scale is a ladder: `xs` is the floor and `display` the top. A value
      // that steps out of order still renders, still resolves, and quietly puts a
      // label above a heading.
      const SCALE = [
        '--tai-text-xs',
        '--tai-text-code',
        '--tai-text-sm',
        '--tai-text-md',
        '--tai-text-lg',
        '--tai-text-section',
        '--tai-text-xl',
        '--tai-text-display',
      ];
      const sizes = new Map(remTokensWithDocumentedPx().map(([token, rem]) => [token, rem]));
      const ladder = SCALE.map((token) => {
        const rem = sizes.get(token);
        if (rem === undefined) throw new Error(`${token} is not authored in rem in tokens.css`);
        return rem;
      });
      expect(ladder).toEqual([...ladder].sort((a, b) => a - b));
      expect(new Set(ladder).size).toBe(ladder.length);
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
        // Forbidden: a four-edge border is the boundary that identifies a control,
        // and this tier sits below the 3:1 a boundary needs.
        'border: 1px solid var(--tai-color-decor);',
        'border-color: var(--tai-color-decor);',
        "{ border: '1px solid var(--tai-color-decor)' }",
        // Allowed: the non-text tier — single-edge rules, grounds, decorative SVG.
        'border-left: 1px solid var(--tai-color-decor);',
        'border-bottom-color: var(--tai-color-decor);',
        'border-inline-start: 1px solid var(--tai-color-decor);',
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
        'border',
        'border-color',
        'border',
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
