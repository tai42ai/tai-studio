/**
 * Every `Field` wrapping a GROUP is marked `group`, asserted across the repo.
 *
 * `Field` renders `<label for>` at the control id it publishes. A group — a
 * `RadioGroup`, anything with `role="radiogroup"`/`role="group"` — never claims
 * that id, because `<label for>` can only name a labelable element; it names
 * itself through `useFieldLabelId()` instead. So a `Field` around a group must
 * pass `group`, or it ships a `for` pointing at an id no element in the document
 * carries.
 *
 * The check is a SOURCE scan and not a rendered assertion because the defect
 * lives at the CALL SITE, not in the component: `Field` and `RadioGroup` were
 * both already covered by rendered tests that pinned the component's two shapes,
 * and four of the six call sites were fixed by hand while two were missed
 * anyway. A per-site gate is the only thing that would have caught them.
 *
 * KNOWN BLIND SPOT, stated rather than papered over: the scan reads the element
 * written directly inside the `Field`, so a child held in a VARIABLE —
 * `const control = cond ? <RadioGroup …/> : <Select …/>; <Field>{control}</Field>`
 * — is invisible to it. `interactions/src/renderers.tsx:222` is exactly that
 * shape and is marked by hand. Widening this to follow a binding needs a real
 * parse (ts-morph or the TS AST), which is the right next step if a third such
 * site appears; the count floor below at least keeps the sites it DOES reach
 * from silently dropping out.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Where a `<Field>` can be written. `dist` and `node_modules` are build output. */
const SCAN_ROOTS = ['packages', 'apps'];
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.turbo', 'build']);

function sourcesWithin(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourcesWithin(full));
      continue;
    }
    if (entry.endsWith('.tsx')) found.push(full);
  }
  return found;
}

const sources = SCAN_ROOTS.flatMap((root) => sourcesWithin(resolve(repoRoot, root)));

/**
 * A `<Field …>` opening tag and everything up to the first element inside it.
 * `[^>]*` cannot cross the tag's own `>`, so the captured attribute text belongs
 * to that `Field` alone and never bleeds in from the child.
 */
const FIELD_WITH_CHILD = /<Field(?<attributes>[^>]*)>\s*(?:\{[^}]*\}\s*)?<(?<child>[A-Za-z]+)/g;

/**
 * The children that are groups rather than labelable controls. A conditional
 * child is written `{cond ? <RadioGroup …> : <Select …>}` and is caught by the
 * separate expression below, which reads the whole `Field` element.
 */
const GROUP_CHILDREN = new Set(['RadioGroup']);

/**
 * `group` as a bare flag or as `group={…}` — either marks the site. The name has
 * to START an attribute: `\b` alone treats the hyphen in `aria-group` as a
 * boundary and would read that as the marker.
 */
function marksGroup(attributes: string): boolean {
  return /(^|\s)group(\s*=|\s|$|\/)/.test(attributes);
}

describe('Field group contract', () => {
  it('scans the repository (a scan that found nothing would pass vacuously)', () => {
    expect(sources.length).toBeGreaterThan(100);
    const fieldSites = sources.filter((file) => readFileSync(file, 'utf8').includes('<Field'));
    expect(fieldSites.length).toBeGreaterThan(10);
  });

  it('marks every Field that wraps a group', () => {
    const unmarked: string[] = [];

    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(FIELD_WITH_CHILD)) {
        const { attributes = '', child = '' } = match.groups ?? {};
        if (!GROUP_CHILDREN.has(child)) continue;
        if (marksGroup(attributes)) continue;
        const line = source.slice(0, match.index).split('\n').length;
        unmarked.push(`${relative(repoRoot, file)}:${String(line)} (<Field> around <${child}>)`);
      }
    }

    expect(unmarked).toEqual([]);
  });

  it('recognises the marker in every spelling a call site uses', () => {
    // Positive controls. Without these, a `marksGroup` that always returned true
    // would leave the scan above green with nothing to report.
    for (const attributes of [' group', ' label="x" group', ' group={a <= b}', ' group\n']) {
      expect([attributes, marksGroup(attributes)]).toEqual([attributes, true]);
    }
    for (const attributes of ['', ' label="x"', ' grouped', ' aria-group="x"']) {
      expect([attributes, marksGroup(attributes)]).toEqual([attributes, false]);
    }
    // The tag matcher must reach the child both directly and through a
    // `{conditional}` child expression.
    const direct = '<Field label="x">\n  <RadioGroup options={o} />';
    const directMatch = [...direct.matchAll(FIELD_WITH_CHILD)][0];
    expect(directMatch?.groups?.child).toBe('RadioGroup');
    expect(marksGroup(directMatch?.groups?.attributes ?? '')).toBe(false);

    const conditional = '<Field label="x" group={n <= 3}>{control}<RadioGroup';
    const conditionalMatch = [...conditional.matchAll(FIELD_WITH_CHILD)][0];
    expect(conditionalMatch?.groups?.child).toBe('RadioGroup');
    expect(marksGroup(conditionalMatch?.groups?.attributes ?? '')).toBe(true);
  });

  it('still reaches every group site in the repository', () => {
    // The count is the guard against the matcher SILENTLY breaking. `[^>]*`
    // cannot cross a `>`, so an attribute value containing one — `group={n > 3}`
    // — makes that site stop matching, and a scan that reaches nothing reports
    // nothing and passes green. Seven sites are reachable today; this floor
    // turns red the moment the matcher stops seeing one.
    const reached = sources.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(FIELD_WITH_CHILD)].filter((match) =>
        GROUP_CHILDREN.has(match.groups?.child ?? ''),
      ),
    );

    expect(reached.length).toBeGreaterThanOrEqual(7);
  });
});
