/**
 * The banned-glyph rule, enforced by a repository-wide SOURCE SCAN.
 *
 * Unicode glyphs used as icons are banned — `▲ ▼ ▾ ↗ → ✓ ×` — because the icon
 * set in `icons.tsx` is the only sanctioned source of iconography: a glyph
 * inherits the text font rather than the 24-grid/1.6-stroke system, and no font
 * stack draws these consistently. The ban is scoped to GLYPH-AS-ICON usage: a
 * glyph carried as an element's SOLE content. The same characters inside real
 * prose — the "Update available → v2.0.0" badge, a "Author combos →" link label
 * — are legitimate and are deliberately NOT matches.
 *
 * Until this file existed the rule had NO enforcement at all: `icons.tsx` and
 * `index.ts` both stated it repo-wide, but the only checks were a handful of
 * per-component assertions on components that happened to be remembered, and
 * four live sites stood through several review cycles. A rule stated in a
 * docblock and checked nowhere is not a rule, which is why this is a scan over
 * every non-test source in the repository rather than another per-component
 * assertion.
 *
 * TWO detectors, because a glyph reaches the screen by two different routes:
 *
 * - {@link jsxSoleGlyphHits} — the glyph written as JSX text between a tag's
 *   `>` and the next `<`, with nothing else but whitespace beside it. This is
 *   the `<Button …>×</Button>` shape.
 * - {@link glyphOnlyLiteralHits} — a string literal whose whole body is banned
 *   glyphs. This is the `{dir === 'asc' ? '▲' : '▼'}` shape, and it also closes
 *   the indirection hole a JSX-only scan would leave: a glyph parked in a
 *   `const` and rendered elsewhere is still caught at its literal.
 *
 * Comments are blanked before either detector runs (see {@link stripComments}),
 * so the arrows that fill this repository's prose docblocks cannot trip it —
 * `<a> → <b>` in a comment is exactly the shape the JSX detector looks for.
 * String bodies survive that pass untouched, which is what the literal detector
 * needs.
 *
 * KNOWN BLIND SPOT, stated rather than papered over: a glyph assembled at
 * runtime (`String.fromCodePoint(0x2715)`, a concatenation, a glyph arriving
 * from the server) has no literal to find and is invisible here. So is a glyph
 * inside a `.css` `content:` property, which is a different rule. Widening to
 * either needs a real parse or a rendered sweep; the floors below at least keep
 * the routes it DOES cover from silently dropping out.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Where rendered source can live. `dist` and `node_modules` are build output. */
const SCAN_ROOTS = ['packages', 'apps'];
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.turbo', 'build']);

/** The banned set, verbatim from the mission's iconography rule. */
const BANNED_GLYPHS = '▲▼▾↗→✓×';

/**
 * The NAMED references the toolchain actually decodes to a banned glyph.
 *
 * It is exactly two. Verified against the transform this repo ships
 * (`esbuild@0.25.12`, Vite's JSX loader): `&times;` and `&rarr;` decode, while
 * `&check;` `&checkmark;` `&nearr;` `&srarr;` pass through as literal text and
 * paint their own spelling, so listing them would redden source that renders
 * nothing banned. Named references are also case-SENSITIVE, which is why the
 * match below is not `i`: `&NEARR;` is not a reference at all.
 *
 * A reference is neither of the stated blind spots — it is a LITERAL in the
 * source, and it paints the banned mark — so `<button>&times;</button>` restores
 * the exact defect the four cleared sites had, with no banned code point in the
 * file for either detector to find. Both forms are decoded before scanning.
 */
const GLYPH_ENTITIES: Readonly<Record<string, string>> = {
  '&times;': '×',
  '&rarr;': '→',
};

/**
 * Every NUMERIC character reference, decimal or hexadecimal.
 *
 * Numeric references are not enumerable: `&#215;` `&#x00d7;` `&#0000215;` all
 * paint `×` and all are legal, so a map of exact spellings is a hole with as
 * many entrances as there are leading zeros. They are PARSED instead — the map
 * above is left holding only the named references, which genuinely are a finite
 * list.
 */
const NUMERIC_REFERENCE = /&#(x?)([0-9a-f]+);/gi;

/** Whitespace-painting references, so a glyph padded with one is still alone. */
const SPACE_REFERENCE = /&(?:nbsp|#0*160|#x0*a0);/gi;

/**
 * Rewrites every banned character reference to the glyph it paints, so both
 * detectors below see the mark rather than its spelling. Length is NOT preserved
 * — no detector here reports an offset, only a file and a snippet.
 */
function decodeGlyphEntities(source: string): string {
  let out = source.replaceAll(NUMERIC_REFERENCE, (whole, hex: string, digits: string) => {
    const code = Number.parseInt(digits, hex === '' ? 10 : 16);
    const glyph = String.fromCodePoint(code);
    return BANNED_GLYPHS.includes(glyph) ? glyph : whole;
  });
  for (const [entity, glyph] of Object.entries(GLYPH_ENTITIES)) {
    out = out.replaceAll(entity, glyph);
  }
  return out;
}

/** Tests state their own expectations; a test file is not a rendering surface. */
function isTestSource(fileName: string): boolean {
  return /\.(?:test|spec)\.tsx?$/.test(fileName);
}

function sourcesWithin(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourcesWithin(full));
      continue;
    }
    if (/\.tsx?$/.test(entry) && !isTestSource(entry)) found.push(full);
  }
  return found;
}

const sources = SCAN_ROOTS.flatMap((root) => sourcesWithin(resolve(repoRoot, root)));

/**
 * Every comment replaced by spaces, at the SAME offsets and line count, so a
 * hit's line number is still the source's. String and template bodies are left
 * exactly as written — the literal detector reads them out of this same text,
 * and blanking a comment's apostrophes is what stops one from opening a phantom
 * string that swallows the code after it.
 *
 * @param source - the file text.
 */
export function stripComments(source: string): string {
  let out = '';
  let index = 0;
  let state: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code';

  while (index < source.length) {
    const char = source.charAt(index);
    const next = source.charAt(index + 1);

    if (state === 'code') {
      if (char === '/' && (next === '/' || next === '*')) {
        state = next === '/' ? 'line' : 'block';
        out += '  ';
        index += 2;
        continue;
      }
      if (char === "'" || char === '"' || char === '`') state = char;
      out += char;
      index += 1;
      continue;
    }

    if (state === 'line') {
      if (char === '\n') state = 'code';
      out += char === '\n' ? char : ' ';
      index += 1;
      continue;
    }

    if (state === 'block') {
      if (char === '*' && next === '/') {
        state = 'code';
        out += '  ';
        index += 2;
        continue;
      }
      out += char === '\n' ? char : ' ';
      index += 1;
      continue;
    }

    // Inside a string: an escape consumes the next character, so a `\'` never
    // closes it; the matching quote does.
    if (char === '\\') {
      out += source.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (char === state) state = 'code';
    out += char;
    index += 1;
  }

  return out;
}

/** The text between two tags. What it RENDERS as is decided by the caller. */
const JSX_TEXT_RUN = />([^<>]*)</g;

/**
 * A JSX expression container holding nothing but a whitespace string literal.
 * It renders as a space and nothing else.
 *
 * Prettier emits exactly this form for a JSX text run's TRAILING space, so it
 * appears beside a glyph without any author choosing to write it: a glyph
 * followed by a space becomes that glyph followed by this container the moment
 * the file is formatted. A detector requiring the whole run between the tags to
 * be glyphs-and-whitespace therefore stops seeing the glyph as soon as the
 * formatter touches the line, with the banned code point still in the file.
 */
const SPACE_EXPRESSION = /\{\s*(['"`])(?:\s|\\u0*a0|\\t|\\n)*\1\s*\}/g;

/**
 * What a JSX text run paints, near enough to judge a lone glyph by: the forms
 * that render as whitespace collapsed to whitespace.
 */
function renderedJsxText(run: string): string {
  return run.replaceAll(SPACE_EXPRESSION, ' ').replaceAll(SPACE_REFERENCE, ' ');
}

/** A run that paints at least one banned glyph and nothing else but whitespace. */
const RENDERS_GLYPHS_ONLY = new RegExp(
  `^[${BANNED_GLYPHS}\\s]*[${BANNED_GLYPHS}][${BANNED_GLYPHS}\\s]*$`,
  'u',
);

/** A single- or double-quoted string, or a substitution-free template. */
const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`/g;

/** A literal body carrying at least one banned glyph and nothing but them. */
const GLYPH_ONLY = new RegExp(
  `^[${BANNED_GLYPHS}\\s]*[${BANNED_GLYPHS}][${BANNED_GLYPHS}\\s]*$`,
  'u',
);

/** The 1-based line `offset` falls on. */
function lineAt(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length;
}

/** Glyphs standing as an element's whole rendered text. `code` must be comment-free. */
export function jsxSoleGlyphHits(code: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  for (const match of code.matchAll(JSX_TEXT_RUN)) {
    const painted = renderedJsxText(match[1] ?? '');
    if (!RENDERS_GLYPHS_ONLY.test(painted)) continue;
    hits.push({ line: lineAt(code, match.index), text: painted.trim() });
  }
  return hits;
}

/** String literals that hold nothing but glyphs. `code` must be comment-free. */
export function glyphOnlyLiteralHits(code: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  for (const match of code.matchAll(STRING_LITERAL)) {
    const body = match[1] ?? match[2] ?? match[3];
    if (body === undefined || body === '' || !GLYPH_ONLY.test(body)) continue;
    hits.push({ line: lineAt(code, match.index), text: body });
  }
  return hits;
}

/** Both detectors over one file's text, as `path:line glyph` strings. */
function violationsIn(file: string): string[] {
  // Entities are decoded AFTER comments are blanked, so an arrow spelled `&rarr;`
  // in a docblock cannot trip the JSX detector the way a literal `→` would not.
  const code = decodeGlyphEntities(stripComments(readFileSync(file, 'utf8')));
  const where = relative(repoRoot, file);
  return [...jsxSoleGlyphHits(code), ...glyphOnlyLiteralHits(code)].map(
    ({ line, text }) => `${where}:${String(line)} ${JSON.stringify(text)}`,
  );
}

describe('banned glyphs', () => {
  it('scans the repository (a scan that found nothing would pass vacuously)', () => {
    expect(sources.length).toBeGreaterThan(250);
    // Every file must be readable and non-empty: a glob that matched paths but
    // read nothing would also report zero violations.
    const empty = sources.filter((file) => readFileSync(file, 'utf8').trim() === '');
    expect(empty).toEqual([]);
  });

  it('still reaches the glyph characters it is looking for', () => {
    // The floor against the scan SILENTLY going blind. These characters are all
    // over the repository's prose and comments; if the reader stops seeing them
    // entirely, the violation list goes empty for the wrong reason.
    const anyGlyph = new RegExp(`[${BANNED_GLYPHS}]`, 'u');
    const carrying = sources.filter((file) => anyGlyph.test(readFileSync(file, 'utf8')));
    expect(carrying.length).toBeGreaterThan(50);
  });

  it('finds no glyph standing as an element or a literal on its own', () => {
    expect(sources.flatMap(violationsIn)).toEqual([]);
  });

  it('detects each shape a glyph-as-icon has actually shipped in', () => {
    // Positive controls, taken from the four sites this scan was written to
    // catch. Without them, detectors that never matched anything would leave the
    // assertion above green with nothing to report.
    const jsxChild = '<Button type="button" aria-label="Remove">\n                ×\n  </Button>';
    expect(jsxSoleGlyphHits(jsxChild).map((hit) => hit.text)).toEqual(['×']);

    const bareChild = '<button style={removeStyle}>×</button>';
    expect(jsxSoleGlyphHits(bareChild).map((hit) => hit.text)).toEqual(['×']);

    const conditionalLiteral = `<span aria-hidden="true">{dir === 'asc' ? '▲' : '▼'}</span>`;
    expect(glyphOnlyLiteralHits(conditionalLiteral).map((hit) => hit.text)).toEqual(['▲', '▼']);

    // The indirection route: a glyph parked in a binding and rendered elsewhere.
    const viaBinding = "const MARK = '×';\nexport const Chip = () => <span>{MARK}</span>;";
    expect(glyphOnlyLiteralHits(viaBinding).map((hit) => hit.text)).toEqual(['×']);

    // Every banned character is actually in the set.
    for (const glyph of BANNED_GLYPHS) {
      expect([glyph, jsxSoleGlyphHits(`<i>${glyph}</i>`).length]).toEqual([glyph, 1]);
    }
  });

  it('leaves a glyph inside real prose alone', () => {
    // Negative controls. A detector that flagged these would make the rule
    // unenforceable and would be silenced rather than obeyed.
    const badge = '<Badge variant="warning">Update available → v{row.latest}</Badge>';
    expect(jsxSoleGlyphHits(badge)).toEqual([]);
    expect(glyphOnlyLiteralHits(badge)).toEqual([]);

    const affordance = '<AppLink to="tools">\n          Author combos →\n        </AppLink>';
    expect(jsxSoleGlyphHits(affordance)).toEqual([]);

    const sentence = `const label = 'scope → url';`;
    expect(glyphOnlyLiteralHits(sentence)).toEqual([]);

    // An icon component named after a glyph is not a glyph.
    expect(jsxSoleGlyphHits('<span>{active ? <SortAscIcon /> : <SortDescIcon />}</span>')).toEqual(
      [],
    );
  });

  it('reads comments as comments, in both directions', () => {
    // Bidirectional control on the comment pass. Left un-stripped, this repo's
    // prose docblocks trip the JSX detector on their own arrows; stripped too
    // eagerly, a real violation on the same line disappears.
    const commented = '// a <div> → <span> mapping\nconst x = 1;';
    expect(jsxSoleGlyphHits(stripComments(commented))).toEqual([]);
    expect(jsxSoleGlyphHits(commented).length).toBe(1);

    const block = '/**\n * before→after\n */\nconst y = 2;';
    expect(stripComments(block).split('\n')).toHaveLength(4);
    expect(glyphOnlyLiteralHits(stripComments("// mark: '×'\nconst z = 3;"))).toEqual([]);

    // A violation on the same LINE as a comment is still found, and its line
    // number survives the blanking.
    const mixed = '// note: a → b\nconst a = 1;\n<i>×</i> // trailing\n';
    expect(jsxSoleGlyphHits(stripComments(mixed))).toEqual([{ line: 3, text: '×' }]);

    // An apostrophe in a comment must not open a string that swallows the code
    // after it — that is how a literal detector goes silently blind.
    const apostrophe = "// the caller's mark\nconst m = '×';";
    expect(glyphOnlyLiteralHits(stripComments(apostrophe)).map((hit) => hit.text)).toEqual(['×']);
  });

  it('reads a banned glyph spelled as an HTML character reference', () => {
    // An entity is a literal in the source that paints the banned mark, so it is
    // neither stated blind spot — and it evaded both detectors, because the file
    // then carries no banned code point at all.
    // The numeric forms are PARSED, not listed: leading zeros are legal in both
    // spellings and the toolchain decodes them, so an enumeration of exact
    // spellings has an entrance per zero.
    for (const entity of ['&times;', '&#215;', '&#00215;', '&#x2713;', '&#x0002713;', '&rarr;']) {
      const markup = `<button type="button">${entity}</button>`;
      expect([entity, jsxSoleGlyphHits(decodeGlyphEntities(markup)).length]).toEqual([entity, 1]);
    }
    // …and via the indirection route the literal detector closes.
    expect(
      glyphOnlyLiteralHits(decodeGlyphEntities("const MARK = '&times;';")).map((hit) => hit.text),
    ).toEqual(['×']);
    // Negative control: anything the toolchain does NOT decode to a banned glyph
    // stays untouched, or the gate reddens source that renders nothing banned.
    // `&neArr;` is U+21D7 (⇗), not the banned U+2197; `&TIMES;` is not a
    // reference at all (named references are case-sensitive); and `&check;`,
    // `&checkmark;`, `&nearr;` and `&srarr;` are passed through verbatim by the
    // JSX transform this repo ships, so each paints its own spelling.
    const untouched =
      '&amp; &nbsp; &larr; &#8592; &neArr; &TIMES; &check; &checkmark; &nearr; &srarr;';
    expect(decodeGlyphEntities(untouched)).toBe(untouched);
  });

  it('sees a glyph that a whitespace form is standing next to', () => {
    // The run between the tags is no longer required to be glyphs-and-whitespace:
    // one adjacent character used to kill the match, and `{' '}` is the form
    // PRETTIER emits for a trailing JSX space — so formatting a line could hide a
    // literal banned code point that is still sitting in the file.
    for (const padded of [
      '<button type="button">×{\' \'}</button>',
      '<button type="button">{\' \'}×</button>',
      '<button type="button">×&nbsp;</button>',
      '<button type="button">&nbsp;×&nbsp;</button>',
      '<button type="button">×{" "}</button>',
    ]) {
      expect([padded, jsxSoleGlyphHits(decodeGlyphEntities(padded)).length]).toEqual([padded, 1]);
    }
    // Negative control: a glyph beside real text is prose, not an icon stand-in.
    expect(jsxSoleGlyphHits('<span>3 × 4</span>')).toEqual([]);
    expect(jsxSoleGlyphHits('<span>{count}</span>')).toEqual([]);
  });
});
