/**
 * The banned-glyph rule, enforced by a repository-wide SOURCE SCAN.
 *
 * Unicode glyphs used as icons are banned — the triangles, the crossed marks, the
 * check marks and the four arrows (see {@link BANNED_GLYPHS}) — because the icon
 * set in `icons.tsx` is the only sanctioned source of iconography: a glyph
 * inherits the text font rather than the 24-grid/1.6-stroke system, and no font
 * stack draws these consistently.
 *
 * The set is enforced at TWO strengths, because the repository holds the two
 * halves of it to two different rules:
 *
 * - The MARK-SHAPED glyphs are banned as glyph-as-icon: carried as an element's
 *   SOLE content. Beside real text they are prose — `3 × 4` is a dimension, not
 *   an icon — and are deliberately not matches.
 * - The DIRECTIONAL glyphs are banned in rendered text WHEREVER they appear,
 *   prose included. Direction is iconography whatever sits beside it, and this
 *   repository renders none: every prose arrow it once carried has been rewritten
 *   in words, and seven components each assert their own absence from
 *   `document.body.textContent` — which is the per-component pattern a
 *   repository-wide scan exists to replace.
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
 * Comments are blanked before either detector runs (see {@link stripComments} and
 * {@link stripHtmlComments}), so the arrows that fill this repository's prose
 * docblocks cannot trip it — `<a> → <b>` in a comment is exactly the shape the JSX
 * detector looks for. String bodies survive that pass untouched, which is what the
 * literal detector needs.
 *
 * The sweep covers every rendered file kind, not only React: the shell's
 * `index.html`, the OAuth bridge and callback documents, and the plain-JavaScript
 * relays beside them are markup a browser paints, and each was outside the scan
 * entirely. A `.html` document is read as MARKUP by the text-run detector, and its
 * inline `<script>` bodies — and only those — by the JavaScript ones.
 *
 * Both detectors judge what the source PAINTS, not how it is spelled: HTML
 * character references and JavaScript string escapes are decoded first, so
 * `&#215;`, `&times;` and `{'\u{00d7}'}` are all read as the `×` they ship.
 *
 * KNOWN BLIND SPOTS, stated rather than papered over, and bounded to the three
 * that are really left:
 *
 * - A glyph assembled at RUNTIME (`String.fromCodePoint(0x2715)`, a
 *   concatenation, a glyph arriving from the server) has no literal to find.
 * - A glyph inside a `.css` `content:` property, which is a different rule.
 * - An ALTERNATE SPELLING of a banned mark: `✕` U+2715 draws what `×` draws,
 *   and is not in the set below because it has never occurred here — see
 *   {@link BANNED_GLYPHS} for the measurement.
 *
 * The floors below at least keep the routes this DOES cover from silently
 * dropping out.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * Where rendered source can live. `dist` and `node_modules` are build output.
 *
 * `e2e/` is in the sweep for the reference plugin: it is the repo's one real plugin,
 * the worked example of the published component API, and it is SERVED to a browser —
 * so a glyph-as-icon in it is the exact thing a plugin author would copy. Leaving it
 * out made "repository-wide" a claim about two thirds of the repository.
 */
const SCAN_ROOTS = ['packages', 'apps', 'e2e'];
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.turbo', 'build']);

/**
 * The file kinds a glyph can be painted from.
 *
 * The scan read `.ts`/`.tsx` only, which left every non-React surface the Studio
 * serves outside it: `apps/studio/index.html`, the two OAuth bridge documents and
 * their `public/` copies, and the plain-JavaScript relays beside them. Each of those
 * is markup a browser renders, and `<button>&times;</button>` in one ships the same
 * glyph-as-icon the four cleared React sites did.
 */
const SCANNED_EXTENSIONS = /\.(?:tsx?|m?js|cjs|html)$/;

/**
 * The banned set: the mission's iconography rule — the marks this repository
 * has actually rendered.
 *
 * ALTERNATE SPELLINGS of those marks — `✕ ✖ ✗ ✘ ⨯` beside `×`, `✔` beside
 * `✓`, `▴ ◂` beside `▸` — are a declared blind spot rather than members.
 * Each was measured at ZERO occurrences in this repository's source and ZERO in
 * this branch's history (`git grep -l -F -- '<glyph>' 3195653` and
 * `git log -S'<glyph>' f2ee1eb..3195653`, both repo-wide, no pathspec — a
 * scoped glob answers this question wrong). Listing them widened the rule only
 * against source that has never existed here; closing the spelling hole for
 * real needs a rendered sweep, not a longer literal.
 */
const BANNED_GLYPHS = '▲▼▾▸↗→✓×↑↓←';

/**
 * The NAMED references the toolchain actually decodes to a banned glyph.
 *
 * It is exactly five, measured against both transforms this repo ships
 * (`esbuild@0.25.12`, Vite's JSX loader, and `tsc@5.9.3`): `&times;` `&rarr;`
 * `&larr;` `&uarr;` `&darr;` decode, while `&check;` `&checkmark;` `&nearr;`
 * `&srarr;` pass through as literal text and paint their own spelling, so
 * listing them would redden source that renders nothing banned. Named references
 * are also case-SENSITIVE, which is why the match below is not `i`: `&NEARR;` is
 * not a reference at all.
 *
 * A reference is neither of the stated blind spots — it is a LITERAL in the
 * source, and it paints the banned mark — so `<button>&times;</button>` restores
 * the exact defect the four cleared sites had, with no banned code point in the
 * file for either detector to find. Both forms are decoded before scanning.
 */
const GLYPH_ENTITIES: Readonly<Record<string, string>> = {
  '&times;': '×',
  '&rarr;': '→',
  '&larr;': '←',
  '&uarr;': '↑',
  '&darr;': '↓',
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
const NUMERIC_REFERENCE = /&#(?:x([0-9a-fA-F]+)|([0-9]+));/g;

/**
 * The character a numeric reference paints, or `undefined` when it names none.
 *
 * Guarded, because the argument is hostile source: `&#x110000;` is outside
 * Unicode and `&#xd800;` is a lone surrogate, and an unguarded
 * `String.fromCodePoint` throws `RangeError` on both — which would kill the
 * suite with a stack trace instead of reporting a finding.
 */
function referencedCharacter(
  hex: string | undefined,
  decimal: string | undefined,
): string | undefined {
  const code = Number.parseInt(hex ?? decimal ?? '', hex === undefined ? 10 : 16);
  if (!Number.isSafeInteger(code) || code < 0 || code > 0x10ffff) return undefined;
  if (code >= 0xd800 && code <= 0xdfff) return undefined;
  return String.fromCodePoint(code);
}

/**
 * The NAMED references that paint whitespace. MEASURED against both transforms
 * this repo ships, not assumed: `&nbsp;` `&ensp;` `&emsp;` `&thinsp;` are the
 * only ones esbuild@0.25.12 AND tsc@5.9.3 decode. `&NonBreakingSpace;`
 * `&ThinSpace;` `&ZeroWidthSpace;` `&Tab;` `&NewLine;` `&hairsp;` `&numsp;`
 * `&puncsp;` `&emsp13;` `&emsp14;` and every other long-form alias pass through
 * both transforms as their own literal text — so they paint themselves, are not
 * padding, and listing them would redden source that renders nothing banned.
 */
const SPACE_REFERENCE_NAMES: Readonly<Record<string, string>> = {
  '&nbsp;': '\u00a0',
  '&ensp;': '\u2002',
  '&emsp;': '\u2003',
  '&thinsp;': '\u2009',
};

/**
 * Rewrites every banned character reference to the glyph it paints, so both
 * detectors below see the mark rather than its spelling. Length is NOT preserved
 * — no detector here reports an offset, only a file and a snippet.
 */
function decodeGlyphEntities(source: string): string {
  let out = source.replaceAll(
    NUMERIC_REFERENCE,
    (whole: string, hex: string | undefined, decimal: string | undefined) => {
      const glyph = referencedCharacter(hex, decimal);
      return glyph !== undefined && BANNED_GLYPHS.includes(glyph) ? glyph : whole;
    },
  );
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
    if (SCANNED_EXTENSIONS.test(entry) && !isTestSource(entry)) found.push(full);
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
 * A JSX expression container holding nothing but one string literal, and the
 * literal's body — whatever it spells.
 *
 * Two different holes close on the same rule, which is why this is one regex
 * rather than a list of accepted spellings:
 *
 * - A container holding a WHITESPACE literal renders as a space and nothing
 *   else. Prettier emits exactly this form for a JSX text run's TRAILING space,
 *   so it appears beside a glyph without any author choosing to write it: a
 *   glyph followed by a space becomes that glyph followed by this container the
 *   moment the file is formatted. A detector requiring the whole run between the
 *   tags to be glyphs-and-whitespace therefore stops seeing the glyph as soon as
 *   the formatter touches the line, with the banned code point still in the file.
 * - A container holding a literal that ESCAPES the glyph — `{'\u{00d7}'}` —
 *   renders exactly the character the ban is written about. Escapes are resolved
 *   by the JavaScript lexer at compile time, so this is the same shipped
 *   character as a bare `×`, not the runtime-assembly blind spot the module
 *   docblock declares.
 *
 * The body is handed to {@link decodeStringEscapes}, so both cases fall out of
 * "paint the literal and judge what it paints" rather than out of an
 * enumeration of forms — the failure mode that put a hole in each of this gate's
 * previous two revisions.
 */
const LITERAL_EXPRESSION =
  /\{\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)\s*\}/g;

/**
 * A JavaScript string escape: `\u{1f600}`, `\u00d7`, `\xd7`, or any single
 * character. Anything else in a literal body is its own text.
 *
 * `\u{…}` takes UNBOUNDED hex digits deliberately: leading zeros are legal, so
 * `\u{00000d7}` is the same `\u{d7}` the lexer reads and a six-digit cap simply
 * gave the ban an entrance per extra zero. The value is range-checked instead.
 */
const STRING_ESCAPE = /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\s\S]))/g;

/** The control characters an escape names; every other escape paints itself. */
const CONTROL_ESCAPES: Readonly<Record<string, string>> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
};

/**
 * What a string literal's SOURCE body paints once the lexer has read it.
 *
 * A code point above U+10FFFF cannot be written as `\u{…}` at all — such a file
 * does not parse — but this reader is handed hostile source, so the value is
 * range-checked rather than trusted: an unguarded `String.fromCodePoint` would
 * throw `RangeError` and kill the suite instead of reporting a finding. Lone
 * surrogates are NOT rejected here (unlike an HTML numeric reference, `\ud800`
 * is a legal JavaScript string), so a surrogate pair spelled as two escapes
 * still reassembles into the character it paints.
 */
function decodeStringEscapes(body: string): string {
  return body.replaceAll(
    STRING_ESCAPE,
    (
      whole: string,
      braced: string | undefined,
      fourHex: string | undefined,
      twoHex: string | undefined,
      single: string | undefined,
    ) => {
      const hex = braced ?? fourHex ?? twoHex;
      if (hex !== undefined) {
        const code = Number.parseInt(hex, 16);
        if (!Number.isSafeInteger(code) || code > 0x10ffff) return whole;
        return String.fromCodePoint(code);
      }
      // A backslash before a newline is a line continuation: it paints nothing.
      if (single === '\n') return '';
      return CONTROL_ESCAPES[single ?? ''] ?? single ?? '';
    },
  );
}

/**
 * An expression container that paints NOTHING: one holding only a JSX comment,
 * and — because {@link stripComments} runs first on a real scan and blanks the
 * comment body — one left holding only whitespace.
 */
const COMMENT_EXPRESSION = /\{\s*\/\*[\s\S]*?\*\/\s*\}/g;
const EMPTY_EXPRESSION = /\{\s*\}/g;

/**
 * What a JSX text run paints, near enough to judge a lone glyph by: the forms
 * that render as whitespace collapsed to whitespace.
 */
function renderedJsxText(run: string): string {
  let out = run
    .replaceAll(COMMENT_EXPRESSION, '')
    .replaceAll(EMPTY_EXPRESSION, '')
    .replaceAll(
      LITERAL_EXPRESSION,
      (
        _whole: string,
        single: string | undefined,
        double: string | undefined,
        template: string | undefined,
      ) => decodeStringEscapes(single ?? double ?? template ?? ''),
    );
  out = out.replaceAll(
    NUMERIC_REFERENCE,
    (whole: string, hex: string | undefined, decimal: string | undefined) =>
      referencedCharacter(hex, decimal) ?? whole,
  );
  for (const [reference, character] of Object.entries(SPACE_REFERENCE_NAMES)) {
    out = out.replaceAll(reference, character);
  }
  return out;
}

/** A run that paints at least one banned glyph and nothing else but whitespace. */
const RENDERED_SPACE = '\\s\\u200b';
const RENDERS_GLYPHS_ONLY = new RegExp(
  `^[${BANNED_GLYPHS}${RENDERED_SPACE}]*[${BANNED_GLYPHS}][${BANNED_GLYPHS}${RENDERED_SPACE}]*$`,
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

/** A template literal tagged `String.raw`, whose body is painted rather than decoded. */
const RAW_TAG = /String\.raw\s*$/;

/** String literals that hold nothing but glyphs. `code` must be comment-free. */
export function glyphOnlyLiteralHits(code: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  for (const match of code.matchAll(STRING_LITERAL)) {
    const source = match[1] ?? match[2] ?? match[3];
    if (source === undefined) continue;
    // The body is decoded before it is judged: `'\u{00d7}'`, `'\xd7'` and a
    // bare `×` are the same shipped character, resolved by the lexer at compile
    // time, so reading the raw source text would let an escape spell the ban away.
    //
    // `String.raw` is the one tag that inverts that: it paints a body's escapes
    // instead of resolving them, so ``String.raw`×` `` renders the six ASCII
    // characters `×` and nothing banned. Decoding it anyway reported a
    // violation in source that ships no glyph at all.
    const raw = match[3] !== undefined && RAW_TAG.test(code.slice(0, match.index));
    const body = raw ? source : decodeStringEscapes(source);
    if (body === '' || !GLYPH_ONLY.test(body)) continue;
    hits.push({ line: lineAt(code, match.index), text: body });
  }
  return hits;
}

/**
 * The DIRECTIONAL half of the banned set.
 *
 * Held to the stricter rule: an arrow says "this way" whether it stands alone or
 * sits inside a sentence, so the sole-content test that fits a mark-shaped glyph
 * lets exactly the usage this half is banned for through.
 */
const DIRECTIONAL_GLYPHS = '←→↑↓';
const PAINTS_A_DIRECTION = new RegExp(`[${DIRECTIONAL_GLYPHS}]`, 'u');

/**
 * Every directional mark a source paints: in a JSX text run, or in a string
 * literal that carries one. `code` must be comment-free — the prose in this
 * repository's docblocks is full of arrows, and they render nothing.
 */
export function directionalGlyphHits(code: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = [];
  for (const match of code.matchAll(JSX_TEXT_RUN)) {
    const painted = renderedJsxText(match[1] ?? '');
    if (!PAINTS_A_DIRECTION.test(painted)) continue;
    hits.push({ line: lineAt(code, match.index), text: painted.trim() });
  }
  for (const match of code.matchAll(STRING_LITERAL)) {
    const written = match[1] ?? match[2] ?? match[3];
    if (written === undefined) continue;
    const raw = match[3] !== undefined && RAW_TAG.test(code.slice(0, match.index));
    const body = raw ? written : decodeStringEscapes(written);
    if (!PAINTS_A_DIRECTION.test(body)) continue;
    hits.push({ line: lineAt(code, match.index), text: body });
  }
  return hits;
}

/**
 * Every HTML comment replaced by spaces, at the SAME offsets and line count.
 *
 * A served document's comments render nothing, and this repository's bridge pages
 * carry long prose comments — read as markup, an arrow between two tag names in one
 * is exactly the shape the text-run detector looks for.
 */
export function stripHtmlComments(source: string): string {
  return source.replaceAll(/<!--[\s\S]*?-->/g, (comment) => comment.replaceAll(/[^\n]/g, ' '));
}

/**
 * A served HTML document with everything OUTSIDE its inline `<script>` bodies
 * blanked, at the same offsets.
 *
 * The markup and the script inside it are two different languages, and only one of
 * them has string literals: run over the markup, a literal detector would read every
 * quoted ATTRIBUTE as a string. Splitting them lets each detector see the language it
 * was written for, with the line numbers still those of the file.
 */
function inlineScriptsOnly(markup: string): string {
  const blank = (text: string): string => text.replaceAll(/[^\n]/g, ' ');
  let out = '';
  let index = 0;
  for (const match of markup.matchAll(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi)) {
    const [whole, open = '', body = ''] = match;
    out += blank(markup.slice(index, match.index)) + blank(open) + body;
    index = match.index + whole.length;
    out += blank(whole.slice(open.length + body.length));
  }
  return out + blank(markup.slice(index));
}

/** Both detectors over a JavaScript or TypeScript source. */
export function scriptHits(source: string): { line: number; text: string }[] {
  // Entities are decoded AFTER comments are blanked, so an arrow spelled `&rarr;`
  // in a docblock cannot trip the JSX detector the way a literal `→` would not.
  const code = decodeGlyphEntities(stripComments(source));
  return [...jsxSoleGlyphHits(code), ...glyphOnlyLiteralHits(code)];
}

/** Both detectors over a served HTML document: its markup, and its inline scripts. */
export function markupHits(source: string): { line: number; text: string }[] {
  const markup = stripHtmlComments(source);
  return [
    ...jsxSoleGlyphHits(decodeGlyphEntities(markup)),
    ...glyphOnlyLiteralHits(decodeGlyphEntities(stripComments(inlineScriptsOnly(markup)))),
  ];
}

/** Both detectors over one file's text, as `path:line glyph` strings. */
function violationsIn(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const hits = file.endsWith('.html') ? markupHits(source) : scriptHits(source);
  const where = relative(repoRoot, file);
  return hits.map(({ line, text }) => `${where}:${String(line)} ${JSON.stringify(text)}`);
}

/** The directional rule over one file's text, as `path:line text` strings. */
function directionalViolationsIn(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const code = file.endsWith('.html')
    ? decodeGlyphEntities(stripHtmlComments(source))
    : decodeGlyphEntities(stripComments(source));
  const where = relative(repoRoot, file);
  return directionalGlyphHits(code).map(
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

    // The surfaces that are NOT React are in the sweep by name. A count floor
    // cannot notice seventeen files dropping out of three hundred, so an
    // extension quietly removed from the pattern — or a root removed from the
    // list — would take every served document back out of the scan silently.
    const scanned = new Set(sources.map((file) => relative(repoRoot, file)));
    for (const surface of [
      'apps/studio/index.html',
      'apps/studio/bridge/oauth-bridge.html',
      'apps/studio/public/oauth-bridge.html',
      'apps/studio/public/oauth-bridge.js',
      'apps/studio/public/oauth-callback.html',
      'apps/studio/public/oauth-callback.js',
      'e2e/reference-plugin/studio-src/index.tsx',
    ]) {
      expect([surface, scanned.has(surface)]).toEqual([surface, true]);
    }
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

  it('paints no directional mark anywhere it renders, prose included', () => {
    expect(sources.flatMap(directionalViolationsIn)).toEqual([]);
  });

  it('reads a directional mark beside text, which the sole-content rule lets pass', () => {
    // The two rules, side by side on the same source. The arrow-bearing prose
    // below is the spelling this repository removed from its badge and its link
    // label; the sole-content detector answers `[]` for both, which is why the
    // directional rule exists rather than being folded into it.
    const badge = '<Badge variant="warning">Update available → v{row.latest}</Badge>';
    expect(jsxSoleGlyphHits(badge)).toEqual([]);
    expect(directionalGlyphHits(badge).map((hit) => hit.text)).toEqual([
      'Update available → v{row.latest}',
    ]);

    const affordance = '<AppLink to="tools">\n          Author combos →\n        </AppLink>';
    expect(jsxSoleGlyphHits(affordance)).toEqual([]);
    expect(directionalGlyphHits(affordance).map((hit) => hit.text)).toEqual(['Author combos →']);

    // The literal route, and the escape spelling of it: both paint the arrow.
    expect(directionalGlyphHits(`const label = 'scope → url';`).map((hit) => hit.text)).toEqual([
      'scope → url',
    ]);
    expect(
      directionalGlyphHits(String.raw`const label = 'scope \u2192 url';`).map((hit) => hit.text),
    ).toEqual(['scope → url']);
    // …and the character-reference spelling, decoded before the scan as everywhere else.
    expect(
      directionalGlyphHits(decodeGlyphEntities('<p>Update available &rarr; v2</p>')).map(
        (hit) => hit.text,
      ),
    ).toEqual(['Update available → v2']);

    // Every directional mark is in the set, or one of the four drops out silently.
    for (const glyph of DIRECTIONAL_GLYPHS) {
      expect([glyph, directionalGlyphHits(`<p>go ${glyph} there</p>`).length]).toEqual([glyph, 1]);
    }

    // Negative controls: a mark-shaped glyph beside text is prose, and a
    // directional mark in a COMMENT renders nothing at all.
    expect(directionalGlyphHits('<span>3 × 4</span>')).toEqual([]);
    expect(directionalGlyphHits(stripComments('// a → b\nconst x = 1;'))).toEqual([]);
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

    // The ESCAPE route. A JavaScript escape is resolved by the lexer, so each of
    // these ships the identical character as the bare mark above; a detector
    // reading the raw source text sees only backslashes and hex digits.
    for (const spelling of [String.raw`\u00d7`, String.raw`\u{00d7}`, String.raw`\xd7`]) {
      const escaped = `<Button type="button" aria-label="Remove">{'${spelling}'}</Button>`;
      expect([spelling, jsxSoleGlyphHits(escaped).map((hit) => hit.text)]).toEqual([
        spelling,
        ['×'],
      ]);
      const parked = `const MARK = '${spelling}';`;
      expect([spelling, glyphOnlyLiteralHits(parked).map((hit) => hit.text)]).toEqual([
        spelling,
        ['×'],
      ]);
    }

    // Every banned character is actually in the set.
    for (const glyph of BANNED_GLYPHS) {
      expect([glyph, jsxSoleGlyphHits(`<i>${glyph}</i>`).length]).toEqual([glyph, 1]);
    }
  });

  it('leaves a glyph inside real prose alone', () => {
    // Negative controls. A detector that flagged these would make the rule
    // unenforceable and would be silenced rather than obeyed.
    const badge = '<Badge variant="warning">3 × 4 grid</Badge>';
    expect(jsxSoleGlyphHits(badge)).toEqual([]);
    expect(glyphOnlyLiteralHits(badge)).toEqual([]);

    const affordance = '<AppLink to="tools">\n          Author combos ✓\n        </AppLink>';
    expect(jsxSoleGlyphHits(affordance)).toEqual([]);

    const sentence = `const label = 'scope × url';`;
    expect(glyphOnlyLiteralHits(sentence)).toEqual([]);

    // An ESCAPED backslash paints a backslash, not the escape that follows it:
    // `'\\u00d7'` renders the six characters `\u00d7`. A decoder that scanned for
    // the text rather than reading the escape would redden this.
    const literalBackslash = String.raw`const path = '\\u00d7';`;
    expect(glyphOnlyLiteralHits(literalBackslash)).toEqual([]);
    expect(jsxSoleGlyphHits(String.raw`<code>{'\u00d7 per row'}</code>`)).toEqual([]);

    // An icon component named after a glyph is not a glyph.
    expect(jsxSoleGlyphHits('<span>{active ? <SortAscIcon /> : <SortDescIcon />}</span>')).toEqual(
      [],
    );

    // A `String.raw` body PAINTS its escapes rather than resolving them, so
    // ``String.raw`×` `` renders six ASCII characters and nothing banned.
    // Decoding it anyway reddened source that ships no glyph at all.
    expect(glyphOnlyLiteralHits('const spelling = String.raw`\\u00d7`;')).toEqual([]);
    expect(glyphOnlyLiteralHits('const spelling = String.raw`\\u{00d7}`;')).toEqual([]);
    // …and the tag does not launder a glyph that is really there.
    expect(glyphOnlyLiteralHits('const mark = String.raw`×`;').map((hit) => hit.text)).toEqual([
      '×',
    ]);
    // An untagged template still decodes, or the escape route reopens.
    expect(glyphOnlyLiteralHits('const mark = `\\u00d7`;').map((hit) => hit.text)).toEqual(['×']);
  });

  it('reads a served HTML document as markup, and its inline script as script', () => {
    // The four HTML surfaces and their JavaScript relays were outside the scan
    // entirely: a glyph-as-icon in one ships exactly as it does from a React tree.
    const markup = '<!doctype html>\n<body>\n  <button type="button">×</button>\n</body>';
    expect(markupHits(markup)).toEqual([{ line: 3, text: '×' }]);
    expect(markupHits('<body>\n  <button type="button">&times;</button>\n</body>')).toEqual([
      { line: 2, text: '×' },
    ]);

    // An HTML comment renders nothing, and this repo's bridge pages carry long
    // prose ones — an arrow between two tag names in a comment is the exact shape
    // the text-run detector looks for.
    expect(markupHits('<body>\n  <!-- maps <a> → <b> -->\n  <p>ok</p>\n</body>')).toEqual([]);
    expect(stripHtmlComments('<!-- a\nb -->\nx').split('\n')).toHaveLength(3);

    // A quoted ATTRIBUTE is not a string literal: read as one, every label in
    // every document would be judged by the literal detector.
    expect(markupHits('<body>\n  <button aria-label="×">Close</button>\n</body>')).toEqual([]);
    // …while a glyph parked in an INLINE script is caught by the literal detector.
    expect(
      markupHits("<body>\n  <script>\n    var MARK = '×';\n  </script>\n</body>").map(
        (hit) => hit.line,
      ),
    ).toEqual([3]);
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
    for (const entity of [
      '&times;',
      '&#215;',
      '&#00215;',
      '&#x2713;',
      '&#x0002713;',
      '&rarr;',
      '&larr;',
      '&uarr;',
      '&darr;',
      '&#8593;',
      '&#8595;',
    ]) {
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
      '&amp; &nbsp; &LeftArrow; &leftarrow; &neArr; &TIMES; &check; &checkmark; &nearr; &srarr;';
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
