/**
 * THE EMISSION INVARIANT: `SchemaForm`'s module graph never reaches the jq door.
 *
 * The door is a multi-megabyte subgraph — the xyflow visual editor, a Web Worker
 * entry, and the jq wasm engine. A bundler EMITS every module a graph can reach,
 * and a dynamic `import()` is such a reach: `lazy` defers the FETCH, not the
 * emission. So a consumer that bundles the SDK to render a form would ship the
 * editor chunk, a worker file, and the wasm — dead weight it may not even be
 * allowed to execute (a strict `script-src 'self'` page with no `worker-src` or
 * `wasm-unsafe-eval` cannot run either). The only fix is to hold no edge at all:
 * the host INJECTS the door, and a form without one renders the plain string
 * input.
 *
 * The graph tests below walk the real static graph from `SchemaForm` AND from the
 * package barrel, failing on any import naming jq in any form — type-only
 * included, because under `verbatimModuleSyntax` a `type` keyword dropped from the
 * specifier is the difference between an erased edge and an emitted one — and pin
 * the published entry point a bundling consumer reaches the form through. The rest
 * pin the runtime half: an annotated field with no injected door renders the plain
 * input.
 */
import { render, screen } from '@testing-library/react';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SchemaForm } from './SchemaForm';
import type { JsonSchema } from './types';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The package's `src`, so a reported module reads as its path from there. */
const SRC = dirname(HERE);

/** Every specifier this module imports or re-exports, static and dynamic. */
function specifiersOf(source: string): string[] {
  const found: string[] = [];
  for (const pattern of [/\bfrom\s*['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]/g]) {
    for (const [, specifier] of source.matchAll(pattern)) {
      if (specifier !== undefined) found.push(specifier);
    }
  }
  return found;
}

/**
 * The source file a relative specifier resolves to. A package specifier and an
 * asset (a stylesheet) resolve to `undefined` — neither continues the walk, and a
 * package specifier is already checked by name.
 */
function resolveModule(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  if (/\.[a-z]+$/.test(specifier) && !/\.[jt]sx?$/.test(specifier)) return undefined;
  const base = resolve(dirname(fromFile), specifier);
  const candidate = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]
    .concat(/\.[jt]sx?$/.test(base) ? [base] : [])
    .find((path) => existsSync(path));
  if (candidate === undefined) {
    throw new Error(`unresolved import "${specifier}" from ${fromFile}`);
  }
  return candidate;
}

/**
 * Walk the static+dynamic import graph from `entry`, collecting every specifier
 * that names jq in any form: `@tai42/jq-studio`, or a relative module whose path
 * segment is `jq` (a pass-through re-export module inside this package).
 */
function jqReachableFrom(entry: string): { offenders: string[]; visited: string[] } {
  const visited = new Set<string>();
  const offenders: string[] = [];
  // Grows as the walk discovers imports; the array iterator re-reads `length`
  // each step, so files appended below are visited in the same pass.
  const queue = [entry];

  for (const file of queue) {
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
      if (/(^|\/)jq($|\/)/.test(specifier) || specifier.includes('jq-studio')) {
        offenders.push(`${relative(SRC, file)} → ${specifier}`);
      }
      const target = resolveModule(file, specifier);
      if (target !== undefined) queue.push(target);
    }
  }
  return { offenders, visited: [...visited].map((file) => relative(SRC, file)) };
}

describe('SchemaForm — the jq-free build graph', () => {
  it('reaches no jq module, statically or dynamically, from SchemaForm', () => {
    const { offenders, visited } = jqReachableFrom(join(HERE, 'index.ts'));

    expect(offenders).toEqual([]);
    // The walk really walked: a resolver that silently found nothing would pass
    // the assertion above vacuously.
    expect(visited.length).toBeGreaterThan(10);
    expect(visited).toContain('schema-form/string-field.tsx');
  });

  it('reaches no jq module from the package BARREL either', () => {
    // The whole point of the standalone-jq architecture: the barrel holds no edge
    // to `@tai42/jq-studio`, not even a thin pass-through re-export. A bundler
    // emits a package's worker file and wasm from the mere presence of the module
    // in the graph — those assets are emitted while it is transformed, before
    // tree-shaking can drop an unused re-export — so a single pass-through here
    // would put ~2.9MB of jq runtime into every consumer that imports this barrel
    // for a Button. Consumers reach the editor by importing `@tai42/jq-studio`
    // themselves and INJECTING it (`expressionField` / `ExpressionFieldContext`).
    const { offenders, visited } = jqReachableFrom(join(SRC, 'index.ts'));

    expect(offenders).toEqual([]);
    // The barrel graph is the whole package, so this walk is far wider than the
    // form's; the floor pins that it really walked.
    expect(visited.length).toBeGreaterThan(40);
    expect(visited).toContain('schema-form/SchemaForm.tsx');
  });

  it('is reachable as its own published entry point, off the barrel', () => {
    // The barrel is jq-free too (above), so this subpath is not a narrower jq-free
    // alternative to it — it is the form-only entry: a bundling consumer that wants
    // `SchemaForm` without the barrel's CSS side effects and design-system graph
    // reaches it here, so `exports` has to keep serving it.
    const manifest = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as Readonly<{
      exports: Readonly<Record<string, unknown>>;
    }>;

    expect(manifest.exports['./schema-form']).toEqual({
      types: './dist/schema-form/index.d.ts',
      import: './dist/schema-form/index.js',
    });
  });
});

const annotated: JsonSchema = {
  type: 'object',
  properties: {
    condition: {
      type: 'string',
      title: 'Route condition',
      description: 'Runs against each signal.',
      'x-tai42-expression': {
        language: 'jq',
        label: 'signal envelope',
        blurb: 'The signal document the route condition inspects.',
        keys: [{ name: 'payload', gloss: 'the emitted body' }],
        returns: 'true or false',
      },
    },
  },
  required: ['condition'],
};

/** The same form with the annotation removed — what the field must fall back to. */
const unannotated: JsonSchema = {
  type: 'object',
  properties: {
    condition: {
      type: 'string',
      title: 'Route condition',
      description: 'Runs against each signal.',
    },
  },
  required: ['condition'],
};

describe('SchemaForm — an annotated field with NO injected door', () => {
  const noop = (): void => undefined;

  it('renders the plain string input', () => {
    render(<SchemaForm schema={annotated} value={{ condition: '.meta' }} onChange={noop} />);

    const field = screen.getByRole('textbox', { name: 'Route condition' });
    expect(field.tagName).toBe('INPUT');
    expect(field).toHaveValue('.meta');
    expect(screen.queryByTestId('jq-door')).not.toBeInTheDocument();
  });

  it('renders BYTE-IDENTICALLY to the same form with no annotation at all', () => {
    // Server rendering makes `useId` position-deterministic, so two identical
    // trees produce identical bytes — the strongest available proof that the
    // annotation changes NOTHING when no door is injected.
    const withAnnotation = renderToStaticMarkup(
      <SchemaForm schema={annotated} value={{ condition: '.meta' }} onChange={noop} />,
    );
    const without = renderToStaticMarkup(
      <SchemaForm schema={unannotated} value={{ condition: '.meta' }} onChange={noop} />,
    );

    expect(withAnnotation).toBe(without);
  });
});
