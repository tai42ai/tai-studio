/**
 * Every `Field` whose child does not CLAIM its control id is marked `group`,
 * asserted across the repo.
 *
 * `Field` renders `<label for>` at the control id it publishes. Only a child
 * that spreads `useFieldControl()` onto a labelable element ever claims that id;
 * anything else — a `RadioGroup`, a composite that opens its own inner `Field`,
 * a `SchemaForm` — leaves the `for` pointing at an id no element in the document
 * carries. So such a `Field` must pass `group`, which drops the `htmlFor` and
 * keeps the label's own `id` for the child to point `aria-labelledby` at.
 *
 * The check is a SOURCE scan and not a rendered assertion because the defect
 * lives at the CALL SITE, not in the component: `Field` and `RadioGroup` were
 * both already covered by rendered tests that pinned the component's two shapes,
 * and four of the six call sites were fixed by hand while two were missed
 * anyway. A per-site gate is the only thing that would have caught them.
 *
 * It FAILS CLOSED. An earlier form of this gate listed the group children
 * (`RadioGroup`) and passed everything else, which let six live sites through —
 * `<Field><MultiToolPicker/></Field>` and friends, each a composite that opens
 * its own `Field` so the OUTER id is claimed by nobody. The list below is
 * therefore the CLAIMING children, and a child that is not on it is a violation
 * until it is marked or added with a reason. A new composite is then a red test
 * rather than a silent dangling IDREF.
 *
 * KNOWN BLIND SPOT, stated rather than papered over: the scan reads the element
 * written DIRECTLY inside the `Field`, so any child that is a JSX EXPRESSION —
 * `<Field>{cond ? <RadioGroup …/> : <Select …/>}</Field>`, or a child held in a
 * variable — is unreadable to a regex, because the branches decide the answer and
 * they can disagree. Resolving those needs a real parse (ts-morph or the TS AST).
 * Until then they are not silently passed: {@link EXPRESSION_CHILD_SITES} is the
 * closed, hand-audited list of every such site with its verdict, and a NEW one is
 * a red test until someone reads it. The count floors below keep the sites the
 * regex DOES reach from silently dropping out.
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
    // Test files state their own expectations and ship no UI; counting them
    // would let sibling-test fixtures prop up the floors that guard the
    // PRODUCTION scan, so a real call site could drop out unnoticed.
    if (entry.endsWith('.tsx') && !/\.(?:test|spec)\.tsx$/.test(entry)) found.push(full);
  }
  return found;
}

const sources = SCAN_ROOTS.flatMap((root) => sourcesWithin(resolve(repoRoot, root)));

/** One `<Field …>` open tag, split at the `>` that really closes it. */
interface FieldOpen {
  readonly attributes: string;
  /** Everything after the open tag, from which the first child is read. */
  readonly rest: string;
  readonly selfClosing: boolean;
  /** Offset of the `<` in the source, for the line number in a failure. */
  readonly index: number;
}

/** A classified `<Field>` site: the element it wraps, or an unreadable expression. */
interface FieldSite {
  readonly attributes: string;
  /** The first child ELEMENT's name, or `undefined` for an expression child. */
  readonly child: string | undefined;
  readonly index: number;
}

/**
 * Every non-self-closing `<Field>` in a source, with its first child element.
 *
 * This is what the whole gate scans, and it SCANS the open tag rather than
 * matching it with a `[^>]*` attribute run. A run like that stops at the first
 * `>` in the file, which need not be the one closing the tag: a single
 * `description={hints.length > 0 ? … }` puts a `>` inside an attribute VALUE, and
 * the site then matches neither the element-child nor the expression-child shape
 * — judged by nothing, absent from the audited expression list, uncounted by the
 * floors. `child` is `undefined` exactly when the first child is an expression.
 *
 * The scanner tracks brace depth, quote state and comments, so the `>` it stops
 * at is the real one. `<FieldGroup …>` is excluded by the lookahead on the start
 * pattern: it is a different component and publishes no control id.
 */
function fieldSites(source: string): FieldSite[] {
  const sites: FieldSite[] = [];
  for (const open of fieldOpens(source)) {
    if (open.selfClosing) continue;
    const element = /^\s*(?:\{[^}]*\}\s*)?<([A-Za-z]+)/.exec(open.rest);
    sites.push({
      attributes: open.attributes,
      child: element?.[1],
      index: open.index,
    });
  }
  return sites;
}

function fieldOpens(source: string): FieldOpen[] {
  const opens: FieldOpen[] = [];
  const start = /<Field(?![A-Za-z])/g;
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
      // Comments first. An apostrophe inside one (`the field's control id`)
      // otherwise opens a phantom string that swallows the tag's own `>`.
      if (character === '/' && source[index + 1] === '/') {
        const end = source.indexOf('\n', index);
        index = end === -1 ? source.length : end;
        continue;
      }
      if (character === '/' && source[index + 1] === '*') {
        const end = source.indexOf('*/', index + 2);
        index = end === -1 ? source.length : end + 1;
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
    const attributes = source.slice(match.index + match[0].length, index);
    opens.push({
      attributes,
      rest: source.slice(index + 1),
      selfClosing: attributes.trimEnd().endsWith('/'),
      index: match.index,
    });
  }
  return opens;
}

/**
 * Every `<Field>` whose child is an expression, audited by hand, with the verdict.
 * The regex cannot decide these — the branches can disagree — so they are listed
 * instead of skipped, and the test below asserts this list is EXACTLY the set of
 * such sites in the repo. A new one reddens until someone reads it.
 */
const EXPRESSION_CHILD_SITES: Readonly<Record<string, string>> = {
  'packages/features/hooks/src/ExecutionKeyPicker.tsx':
    'Select on the ready branch, ErrorState / <p role="status"> otherwise — group is branch-conditional.',
  'packages/features/hooks/src/TopicVerifierForm.tsx':
    'Select on the ready branch, ErrorState / <p role="status"> otherwise — group is branch-conditional.',
  'packages/features/interactions/src/renderers.tsx':
    'RadioGroup at or below RADIO_MAX_OPTIONS, Select above — group is branch-conditional.',
  'packages/studio-sdk/src/components/reveal-input.tsx':
    'Both branches are the SDK TextInput, which claims the control id — no marker needed.',
  'packages/studio-sdk/src/components/tool-picker.tsx':
    'Both branches are a Select, which claims the control id — no marker needed.',
  'packages/studio-sdk/src/schema-form/string-field.tsx':
    'CompletionInput or TextInput, both of which claim the control id — no marker needed.',
};

/**
 * The children that DO claim the `Field`'s control id, so a `Field` around one
 * of them correctly renders `htmlFor`. Everything else must be marked `group`.
 *
 * The first eight spread `useFieldControl()` straight onto a labelable element
 * (`grep -rl useFieldControl` finds exactly those modules — `UploadDropZone` is
 * split out of `MediaField` for precisely this reason, so its hook call runs
 * inside the `Field`). The last two claim it THROUGH an inner control and are
 * listed with that reason:
 *
 * - `TagsInput` renders the SDK's `TextInput`, which claims the id.
 * - `ToolPicker` renders its `Select` bare when it is given no `label` of its
 *   own, and that `Select` claims the id. Every in-repo `<Field><ToolPicker>`
 *   site omits `label`; a site that passed one would open an inner `Field`, and
 *   the outer id would dangle — which is why the label-less shape is the only
 *   one this entry covers.
 */
const CLAIMING_CHILDREN = new Set([
  'TextInput',
  'Textarea',
  'NumberInput',
  'RevealInput',
  'Select',
  'Checkbox',
  'CompletionInput',
  'UploadDropZone',
  'TagsInput',
  'ToolPicker',
]);

/**
 * The attribute text with every VALUE blanked — quoted strings and `{…}`
 * expression bodies — so only attribute NAMES remain. Without it a prose value
 * carrying the word "group" (`description="…pick one from the group below."`)
 * reads as the marker and exempts the site from the whole rule; every label and
 * description in this repository is an English sentence, so that is the adjacent
 * defect, not a contrived one. Brace bodies are blanked innermost-first so a
 * nested `{{…}}` cannot leave its outer body behind.
 */
function attributeNames(attributes: string): string {
  let text = attributes.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  let previous = '';
  while (text !== previous) {
    previous = text;
    text = text.replace(/\{[^{}]*\}/g, '{}');
  }
  return text;
}

/**
 * `group` as a bare flag or as `group={…}` — either marks the site. The name has
 * to START an attribute: `\b` alone treats the hyphen in `aria-group` as a
 * boundary and would read that as the marker. Values are blanked first (see
 * {@link attributeNames}) so only a real attribute can be the marker.
 */
function marksGroup(attributes: string): boolean {
  return /(^|\s)group(\s*=|\s|$|\/)/.test(attributeNames(attributes));
}

describe('Field group contract', () => {
  it('scans the repository (a scan that found nothing would pass vacuously)', () => {
    expect(sources.length).toBeGreaterThan(100);
    const fieldSites = sources.filter((file) => readFileSync(file, 'utf8').includes('<Field'));
    expect(fieldSites.length).toBeGreaterThan(10);
  });

  it('marks every Field whose child does not claim its control id', () => {
    const unmarked: string[] = [];

    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      for (const site of fieldSites(source)) {
        // An expression child is judged by EXPRESSION_CHILD_SITES, not here.
        if (site.child === undefined) continue;
        if (CLAIMING_CHILDREN.has(site.child)) continue;
        if (marksGroup(site.attributes)) continue;
        const line = source.slice(0, site.index).split('\n').length;
        unmarked.push(
          `${relative(repoRoot, file)}:${String(line)} (<Field> around <${site.child}>)`,
        );
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
    const directMatch = fieldSites(direct)[0];
    expect(directMatch?.child).toBe('RadioGroup');
    expect(marksGroup(directMatch?.attributes ?? '')).toBe(false);

    const conditional = '<Field label="x" group={n <= 3}>{control}<RadioGroup';
    const conditionalMatch = fieldSites(conditional)[0];
    expect(conditionalMatch?.child).toBe('RadioGroup');
    expect(marksGroup(conditionalMatch?.attributes ?? '')).toBe(true);

    // Fail-closed control: a child nobody has classified is a violation, not a
    // pass. This is the property the earlier allowlist-of-groups form lacked.
    expect(CLAIMING_CHILDREN.has('SomeNewComposite')).toBe(false);
    expect(CLAIMING_CHILDREN.has('RadioGroup')).toBe(false);
    expect(CLAIMING_CHILDREN.has('TextInput')).toBe(true);
  });

  it('still reaches every Field site in the repository', () => {
    // A floor against the matcher silently reaching LESS. It is deliberately not
    // the only guard: a count with headroom cannot notice one site dropping out,
    // which is why `leaves no <Field> unjudged` below reconciles the set exactly.
    const reached = sources.flatMap((file) => fieldSites(readFileSync(file, 'utf8')));
    expect(reached.filter((site) => site.child !== undefined).length).toBeGreaterThanOrEqual(80);

    // And the marked sites specifically, which are what the rule is about.
    const marked = reached.filter((site) => marksGroup(site.attributes));
    expect(marked.length).toBeGreaterThanOrEqual(12);
  });

  it('leaves no <Field> unjudged by BOTH detectors', () => {
    // The reconciliation that makes "the blind spot is bounded" true. Every
    // `<Field>` in the repo must be read by the element-child detector, by the
    // expression-child detector, or be self-closing. A site read by neither is
    // invisible to the whole gate — not listed, not judged, not counted by the
    // floors — which is exactly how `CreatePresetForm.tsx`'s
    // `description={hints.length > 0 ? … }` slipped past a `[^>]*` attribute run.
    // Both probes are ANCHORED at the child position. Handing the shared regexes
    // a window of trailing source instead lets them skip forward and match the
    // NEXT `<Field>` in the file, reporting this one as judged — a false green
    // this reconciliation caught in its own first draft.
    const ELEMENT_CHILD = /^\s*(?:\{[^}]*\}\s*)?<[A-Za-z]/;
    const EXPRESSION_CHILD = /^\s*\{\s*[^<]/;
    const unjudged: string[] = [];
    for (const file of sources) {
      const source = readFileSync(file, 'utf8');
      for (const open of fieldOpens(source)) {
        if (open.selfClosing) continue;
        if (ELEMENT_CHILD.test(open.rest) || EXPRESSION_CHILD.test(open.rest)) continue;
        unjudged.push(`${relative(repoRoot, file)} :: ${open.attributes.trim().slice(0, 60)}`);
      }
    }
    expect(unjudged).toEqual([]);
    // The scanner really found the Fields — otherwise an empty sweep passes.
    expect(
      sources.flatMap((file) => fieldOpens(readFileSync(file, 'utf8'))).length,
    ).toBeGreaterThan(80);
  });

  it('accounts for every Field whose child the regex cannot read', () => {
    // The blind spot is bounded, not ignored: this is the closed set, and a new
    // expression-child site reddens here until it is audited and listed.
    const found = sources
      .filter((file) =>
        fieldSites(readFileSync(file, 'utf8')).some((site) => site.child === undefined),
      )
      .map((file) => relative(repoRoot, file))
      .sort();
    expect(found).toEqual(Object.keys(EXPRESSION_CHILD_SITES).sort());
    for (const verdict of Object.values(EXPRESSION_CHILD_SITES)) {
      expect(verdict.length).toBeGreaterThan(20);
    }
  });

  it('reads a value carrying the word "group" as prose, not as the marker', () => {
    // Bidirectional control on the value-blanking pass. Left un-blanked, a
    // description mentioning a group exempts its Field from the entire rule — a
    // gate reporting success while checking less than it claims.
    expect(marksGroup(' label="Choose a group of tools"')).toBe(false);
    expect(marksGroup(' description="Pick the group that applies"')).toBe(false);
    expect(marksGroup(" description='one from the group below' ")).toBe(false);
    expect(marksGroup(' className={cx("a group b")}')).toBe(false);
    // …and the real marker still reads, alongside such a value.
    expect(marksGroup(' description="pick from the group below" group')).toBe(true);
    expect(marksGroup(' group={options.length <= MAX} label="Answer"')).toBe(true);
    // Nested braces are blanked all the way out.
    expect(marksGroup(' style={{ marginTop: group }}')).toBe(false);
  });

  it('reads FieldGroup as a different component', () => {
    // `<FieldGroup>` publishes no control id and renders no `<label for>`, so the
    // `group` rule does not apply to it. Without the negative lookahead the
    // matcher reads it as a `Field` and demands a marker it must never have.
    const fieldGroup = '<FieldGroup heading="Options" atRoot={false}>\n  <ObjectFields';
    expect(fieldSites(fieldGroup)).toEqual([]);
    const field = '<Field label="Options">\n  <TextInput';
    expect(fieldSites(field)).toHaveLength(1);
  });
});
