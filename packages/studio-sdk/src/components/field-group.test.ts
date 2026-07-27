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

/**
 * Where a `<Field>` can be written. `dist` and `node_modules` are build output.
 *
 * `e2e/` is in the sweep for the reference plugin: it is the repo's one real plugin and
 * the worked example of the published component API, so a dangling `for` attribute it
 * ships is the exact defect a plugin author would copy. Leaving it out made this file's
 * "across the repo" a claim about two thirds of it.
 */
const SCAN_ROOTS = ['packages', 'apps', 'e2e'];
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.turbo', 'build']);

/**
 * A source with every comment replaced by spaces, at the SAME offsets so a line
 * number still points at the line it came from.
 *
 * The scan reads what the file RENDERS, and a comment renders nothing. Both
 * directions were open without this: a `<Field>` written in a docblock to explain the
 * rule reddened the build — it has already bitten two fixes — while ten commented-out
 * call sites propped up the count floors that guard the production scan, so a real site
 * could drop out unnoticed. String bodies are left as written: the attribute readers
 * blank the values they need blanked, and an apostrophe inside a comment is what would
 * otherwise open a phantom string that swallows the code after it.
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

/** A file's text as the scan reads it: the code, with the prose blanked out. */
function codeOf(file: string): string {
  return withoutComments(readFileSync(file, 'utf8'));
}

/** The 1-based line `offset` falls on. */
function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
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
 * The scanner tracks brace depth and quote state, so the `>` it stops at is the
 * real one; comments are blanked before it runs (see {@link withoutComments}), so
 * an apostrophe in prose cannot open a phantom string that swallows the tag.
 * `<FieldGroup …>` is excluded by the lookahead on the start pattern: it is a
 * different component and publishes no control id.
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
  'packages/features/agents/src/ComposeAgentDialog.tsx':
    'ErrorState on a failed read, MultiToolPicker / PresetSpecEditor / SubAgentComposer otherwise — all three are marked group, so neither branch claims the control id.',
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

/**
 * The marker in a spelling whose answer is STATIC: the bare flag, or an explicit
 * `group={true}`.
 *
 * {@link marksGroup} blanks every `{…}` body before it looks (so a prose value
 * carrying the word "group" cannot pose as the marker), which means `group` and
 * `group={false}` are indistinguishable to it. At an ELEMENT child that is a
 * hole, not a nuance: the child is written in the source, so whether the Field is
 * a group is decided at authoring time, and `group={false}` would exempt the site
 * from the whole rule while `field.tsx` goes on emitting `htmlFor={controlId}` at
 * an id no element carries — the exact dangling IDREF this gate exists to
 * prevent. An EXPRESSION child is the only place a runtime condition is ever
 * needed, and {@link marksGroup} still serves that reconciliation.
 *
 * The `{true}` form is read from the attributes with only STRING bodies blanked,
 * because the brace body is precisely what has to be inspected here.
 */
function marksGroupStatically(attributes: string): boolean {
  if (/(^|\s)group(\s|$|\/)/.test(attributeNames(attributes))) return true;
  const withoutStrings = attributes.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
  return /(^|\s)group\s*=\s*\{\s*true\s*\}/.test(withoutStrings);
}

describe('Field group contract', () => {
  it('scans the repository (a scan that found nothing would pass vacuously)', () => {
    expect(sources.length).toBeGreaterThan(100);
    const fieldSites = sources.filter((file) => codeOf(file).includes('<Field'));
    expect(fieldSites.length).toBeGreaterThan(10);
  });

  it('marks every Field whose child does not claim its control id', () => {
    const unmarked: string[] = [];

    for (const file of sources) {
      const source = codeOf(file);
      for (const site of fieldSites(source)) {
        // An expression child is judged by EXPRESSION_CHILD_SITES, not here.
        if (site.child === undefined) continue;
        if (CLAIMING_CHILDREN.has(site.child)) continue;
        if (marksGroupStatically(site.attributes)) continue;
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
    const reached = sources.flatMap((file) => fieldSites(codeOf(file)));
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
      const source = codeOf(file);
      for (const open of fieldOpens(source)) {
        if (open.selfClosing) continue;
        if (ELEMENT_CHILD.test(open.rest) || EXPRESSION_CHILD.test(open.rest)) continue;
        // Named by LINE and by the text that follows the tag. An attribute run is
        // often empty at exactly the site that fails, so reporting it alone said
        // `field.tsx :: ` and left the reader to find the tag by hand.
        unjudged.push(
          `${relative(repoRoot, file)}:${String(lineAt(source, open.index))} ` +
            `<Field${open.attributes.trim()}> then ${JSON.stringify(open.rest.slice(0, 60))}`,
        );
      }
    }
    expect(unjudged).toEqual([]);
    // The scanner really found the Fields — otherwise an empty sweep passes.
    expect(sources.flatMap((file) => fieldOpens(codeOf(file))).length).toBeGreaterThan(80);
  });

  it('accounts for every Field whose child the regex cannot read', () => {
    // The blind spot is bounded, not ignored: this is the closed set, and a new
    // expression-child site reddens here until it is audited and listed.
    const found = sources
      .filter((file) => fieldSites(codeOf(file)).some((site) => site.child === undefined))
      .map((file) => relative(repoRoot, file))
      .sort();
    expect(found).toEqual(Object.keys(EXPRESSION_CHILD_SITES).sort());
    // Each verdict is reconciled against the file it judges: it must name at least
    // one element that file really renders. A length floor asserted nothing — the
    // verdicts run 75 to 99 characters, so `> 20` was dead the day it was written,
    // and a placeholder ("audited", "n/a") or a verdict pasted from another site
    // would have satisfied it while describing branches nobody read.
    for (const [path, verdict] of Object.entries(EXPRESSION_CHILD_SITES)) {
      const source = codeOf(resolve(repoRoot, path));
      const rendered = [...verdict.matchAll(/\b[A-Z][A-Za-z]+\b/g)]
        .map((match) => match[0])
        .filter((name) => new RegExp(`<${name}[\\s/>]`).test(source));
      expect([path, rendered.length > 0]).toEqual([path, true]);
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
