/**
 * Every `<JsonTree>` this repository renders names its pane, asserted by a
 * repository-wide SOURCE SCAN.
 *
 * The pane IS its own scrolling box, so it carries the region attributes itself:
 * while it overflows it becomes a `role="region"` keyboard target, and `label` is
 * the name that region answers to. `label` is optional with a `'JSON'` fallback,
 * because a plugin author dropping the component into a page should get something
 * rather than an unnamed landmark — and that fallback is exactly why nothing else
 * can catch a site that forgets it:
 *
 * - TYPECHECK carries nothing. `label` is optional, so deleting `label=` at every
 *   in-repo call site compiles.
 * - The RENDERED tests carry almost nothing. jsdom runs no layout, so
 *   `scrollWidth > clientWidth` is never true and `useOverflowRegion` never
 *   applies the name at all; deleting `label=` at all thirteen product sites
 *   reddens seven of them, on assertions about other things.
 *
 * What a missing `label` costs is a screen-reader user meeting several panes on
 * one page — a trace's input and output, a preset's fixed kwargs and its output
 * schema — that all answer to "JSON" and cannot be told apart. That is a fact
 * about the CALL SITE, which is why this is a scan over the sites rather than
 * another assertion about the component.
 *
 * The scan is REPO-WIDE rather than "outside the SDK": the SDK's own five sites
 * pass a label today and are as capable of dropping one as any other, and a gate
 * that exempted the package it lives in would be reporting coverage it does not
 * have. `e2e/reference-plugin` is in the sweep by name — it is the repo's one
 * real plugin and the worked example of the published component API, so a pane it
 * leaves unnamed is the exact defect a plugin author would copy.
 *
 * KNOWN BLIND SPOT, stated rather than papered over: the scan reads the attribute
 * NAMES written on the tag. A `label` whose value is an expression that can
 * evaluate to `undefined` (`label={row.title}`) satisfies it and would fall back
 * at runtime; deciding that needs a real parse and a type. The floors below at
 * least keep the sites it DOES reach from silently dropping out.
 */
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { productSourcesWithin } from './test-tab-stops';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

/**
 * Where a `<JsonTree>` can be written. `productSourcesWithin` drops build output,
 * test files and the SDK's own testing entry: a pane only a test renders is not a
 * landmark any reader meets.
 */
const SCAN_ROOTS = ['packages', 'apps', 'e2e'];

const sources = SCAN_ROOTS.flatMap((root) => productSourcesWithin(resolve(repoRoot, root)));

/**
 * A source with every comment replaced by spaces, at the SAME offsets so a line
 * number still points at the line it came from.
 *
 * The scan reads what a file RENDERS, and a comment renders nothing: two modules
 * here introduce the component by writing `<JsonTree>` in their docblock, and read
 * as code those are call sites with no attributes at all. String bodies are left
 * as written — the attribute reader needs them, and an apostrophe inside prose is
 * what would otherwise open a phantom string that swallows the code after it.
 */
function withoutComments(source: string): string {
  let out = '';
  let index = 0;
  let state: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code';
  while (index < source.length) {
    const character = source.charAt(index);
    const next = source.charAt(index + 1);
    if (state === 'code') {
      if (character === '/' && (next === '/' || next === '*')) {
        state = next === '/' ? 'line' : 'block';
        out += '  ';
        index += 2;
        continue;
      }
      if (character === "'" || character === '"' || character === '`') state = character;
      out += character;
      index += 1;
      continue;
    }
    if (state === 'line') {
      if (character === '\n') state = 'code';
      out += character === '\n' ? character : ' ';
      index += 1;
      continue;
    }
    if (state === 'block') {
      if (character === '*' && next === '/') {
        state = 'code';
        out += '  ';
        index += 2;
        continue;
      }
      out += character === '\n' ? character : ' ';
      index += 1;
      continue;
    }
    // Inside a string: an escape consumes the next character, so a `\'` never
    // closes it; the matching quote does.
    if (character === '\\') {
      out += source.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (character === state) state = 'code';
    out += character;
    index += 1;
  }
  return out;
}

/** One `<JsonTree …>` open tag: its attribute run, and where the tag began. */
export interface JsonTreeSite {
  readonly attributes: string;
  /** Offset of the `<` in the source, for the line number in a failure. */
  readonly index: number;
}

/**
 * Every `<JsonTree>` open tag in a source, split at the `>` that really closes it.
 *
 * The tag is SCANNED rather than matched with a `[^>]*` attribute run: a run like
 * that stops at the first `>` in the file, which need not be the one closing the
 * tag — a single `data={rows.length > 0 ? rows : null}` puts a `>` inside an
 * attribute VALUE, and the site then reports a truncated attribute run and reads
 * as missing whatever came after it. Brace depth and quote state are tracked, so
 * the `>` this stops at is the real one.
 *
 * The negative lookahead keeps a differently-named component out: `<JsonTreeRow>`
 * is not this component and publishes no region.
 */
export function jsonTreeSites(source: string): JsonTreeSite[] {
  const sites: JsonTreeSite[] = [];
  const start = /<JsonTree(?![A-Za-z])/g;
  let match: RegExpExecArray | null;
  while ((match = start.exec(source)) !== null) {
    let index = match.index + match[0].length;
    let depth = 0;
    let quote: string | undefined;
    for (; index < source.length; index += 1) {
      const character = source[index] ?? '';
      if (quote !== undefined) {
        if (character === '\\') index += 1;
        else if (character === quote) quote = undefined;
        continue;
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character;
      } else if (character === '{') {
        depth += 1;
      } else if (character === '}') {
        depth -= 1;
      } else if (character === '>' && depth === 0) {
        break;
      }
    }
    sites.push({
      attributes: source.slice(match.index + match[0].length, index),
      index: match.index,
    });
  }
  return sites;
}

/**
 * The attribute text with every VALUE blanked — quoted strings and `{…}`
 * expression bodies — so only attribute NAMES remain. Without it a value carrying
 * the word `label` (`data={{ label: node.name }}`, `data={row.label}`) reads as
 * the attribute and exempts the site from the rule; a JSON pane's data is very
 * often exactly such an object, so that is the adjacent defect, not a contrived
 * one. Brace bodies are blanked innermost-first so a nested `{{…}}` cannot leave
 * its outer body behind.
 */
function attributeNames(attributes: string): string {
  let text = attributes.replaceAll(/"[^"]*"/g, '""').replaceAll(/'[^']*'/g, "''");
  let previous = '';
  while (text !== previous) {
    previous = text;
    text = text.replaceAll(/\{[^{}]*\}/g, '{}');
  }
  return text;
}

/**
 * Whether the tag passes `label`. The name has to START an attribute — `\b` alone
 * treats the hyphen in `aria-label` as a boundary and would read that as the
 * name — and it has to be GIVEN a value, because `label` as a bare JSX flag is
 * `label={true}` and names the region "true".
 */
export function passesLabel(attributes: string): boolean {
  return /(^|\s)label\s*=/.test(attributeNames(attributes));
}

/** The 1-based line `offset` falls on. */
function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

describe('JsonTree label contract', () => {
  it('scans the repository (a scan that found nothing would pass vacuously)', () => {
    expect(sources.length).toBeGreaterThan(100);
    // The reference plugin by NAME. A count floor cannot notice one file dropping
    // out of hundreds, and it is the file a plugin author copies from.
    const scanned = new Set(sources.map((file) => relative(repoRoot, file)));
    expect(scanned.has('e2e/reference-plugin/studio-src/index.tsx')).toBe(true);
  });

  it('still reaches every JsonTree site in the repository', () => {
    // A floor against the matcher silently reaching LESS, and a spread over the
    // packages so the whole set cannot collapse into one file's worth of hits.
    const reached = sources.flatMap((file) =>
      jsonTreeSites(withoutComments(readFileSync(file, 'utf8'))),
    );
    expect(reached.length).toBeGreaterThanOrEqual(12);
    const files = sources.filter(
      (file) => jsonTreeSites(withoutComments(readFileSync(file, 'utf8'))).length > 0,
    );
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it('names the pane at every site', () => {
    const unnamed: string[] = [];
    for (const file of sources) {
      const source = withoutComments(readFileSync(file, 'utf8'));
      for (const site of jsonTreeSites(source)) {
        if (passesLabel(site.attributes)) continue;
        unnamed.push(`${relative(repoRoot, file)}:${String(lineAt(source, site.index))}`);
      }
    }
    expect(unnamed).toEqual([]);
  });

  it('reads the tag the way the sites are really written', () => {
    // Positive controls. Without these, a reader that matched nothing would leave
    // the assertion above green with nothing to report.
    const inline = '<JsonTree data={result} label="Tool result" />';
    expect(jsonTreeSites(inline)).toHaveLength(1);
    expect(passesLabel(jsonTreeSites(inline)[0]?.attributes ?? '')).toBe(true);

    const multiline = '<JsonTree\n  data={entry.body}\n  label={`Version ${n} body`}\n/>';
    expect(passesLabel(jsonTreeSites(multiline)[0]?.attributes ?? '')).toBe(true);

    const bare = '<JsonTree data={{ a: 1 }} defaultExpanded />';
    expect(passesLabel(jsonTreeSites(bare)[0]?.attributes ?? '')).toBe(false);

    // A `>` inside an attribute VALUE does not close the tag. Matched with a
    // `[^>]*` run this reports `data={rows.length ` and reads as unlabelled.
    const comparison = '<JsonTree data={rows.length > 0 ? rows : null} label="Rows" />';
    const compared = jsonTreeSites(comparison)[0];
    expect(compared?.attributes).toContain('label="Rows"');
    expect(passesLabel(compared?.attributes ?? '')).toBe(true);

    // A differently-named component is not this one.
    expect(jsonTreeSites('<JsonTreeRow data={x} />')).toEqual([]);
  });

  it('reads a value carrying the word "label" as data, not as the attribute', () => {
    // Bidirectional control on the value-blanking pass. Left un-blanked, a payload
    // with a `label` key exempts its site from the entire rule — a gate reporting
    // success while checking less than it claims. A JSON pane's data is very often
    // exactly such an object.
    expect(passesLabel(' data={{ label: node.name }}')).toBe(false);
    expect(passesLabel(' data={row.label}')).toBe(false);
    expect(passesLabel(' data={{ meta: { label: 1 } }}')).toBe(false);
    expect(passesLabel(' data={x} aria-label="Body"')).toBe(false);
    // A bare flag is `label={true}` and would name the region "true".
    expect(passesLabel(' data={x} label')).toBe(false);
    // …and the real attribute still reads, alongside such a value.
    expect(passesLabel(' data={{ label: node.name }} label="Node"')).toBe(true);
    expect(passesLabel(' data={x} label={`${name} input`}')).toBe(true);
  });

  it('reads comments as comments, in both directions', () => {
    // Two modules introduce the component in a docblock. Read as code those are
    // call sites with no attributes; stripped too eagerly, a real site on the same
    // line disappears and its line number moves.
    const documented =
      '/**\n * rendered as a collapsible `<JsonTree>`. Every value is escaped\n */\nconst x = 1;';
    expect(jsonTreeSites(withoutComments(documented))).toEqual([]);
    expect(jsonTreeSites(documented)).toHaveLength(1);
    // …and the blanking keeps the line count, so a later hit still reports true.
    expect(withoutComments(documented).split('\n')).toHaveLength(4);

    const mixed = '// see <JsonTree>\nconst a = 1;\n<JsonTree data={x} label="L" />';
    const found = jsonTreeSites(withoutComments(mixed));
    expect(found).toHaveLength(1);
    expect(lineAt(withoutComments(mixed), found[0]?.index ?? 0)).toBe(3);

    // An apostrophe in a comment must not open a string that swallows the code
    // after it — that is how a source scanner goes silently blind.
    const apostrophe = "// the caller's pane\n<JsonTree data={x} />";
    expect(jsonTreeSites(withoutComments(apostrophe))).toHaveLength(1);
  });
});
