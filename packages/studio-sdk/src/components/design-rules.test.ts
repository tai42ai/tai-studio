/**
 * The README's "Design rules" section names the SDK pieces a screen is built from.
 * Every backticked component (a PascalCase name) or hook (`use` then a capital) in
 * that section must be a runtime export of the package entry, so renaming or
 * removing a primitive reddens until the rules are brought with it. The names are
 * derived from the README itself; a reader that finds too few fails rather than
 * passing on an empty list.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as sdk from '../index';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readme = readFileSync(resolve(packageRoot, 'README.md'), 'utf8');

const SECTION_HEADING = '## Design rules';
const COMPONENT_NAME = /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)*$/;
const HOOK_NAME = /^use[A-Z][A-Za-z0-9]*$/;

/** The section's text, from its heading to the next `## ` heading (or the end). */
function designRulesSection(source: string): string {
  const start = source.indexOf(`\n${SECTION_HEADING}\n`);
  if (start === -1) return '';
  const body = source.slice(start + SECTION_HEADING.length + 2);
  const next = body.search(/^## /m);
  return next === -1 ? body : body.slice(0, next);
}

/** Every distinct backticked component or hook name in `text`, in first-seen order. */
function namedPieces(text: string): string[] {
  const names = [...text.matchAll(/`([^`\n]+)`/g)]
    .map((match) => match[1] ?? '')
    .filter((name) => COMPONENT_NAME.test(name) || HOOK_NAME.test(name));
  return [...new Set(names)];
}

describe('README design rules, prose vs package exports', () => {
  const names = namedPieces(designRulesSection(readme));

  it('names at least ten SDK components and hooks', () => {
    expect(names.length).toBeGreaterThanOrEqual(10);
  });

  it('names only pieces the package entry exports at runtime', () => {
    const exported = sdk as Record<string, unknown>;
    const missing = names.filter((name) => exported[name] === undefined);
    expect(missing).toEqual([]);
  });
});
