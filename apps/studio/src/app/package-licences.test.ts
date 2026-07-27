/**
 * Every published package redistributes the licence it claims.
 *
 * Both publishable packages declare `"license": "Apache-2.0"`, whose §4(a)
 * requires a copy of the License to accompany every distributed copy of the Work
 * and §4(d) requires the NOTICE text to travel with it. npm auto-includes a
 * licence file only from the PACKAGE directory, and both packages keep a `files`
 * allow-list, so a `LICENSE`/`NOTICE` sitting at the repository root reaches no
 * tarball at all — the artefact a consumer installs is what has to carry them.
 *
 * The publishable set is DERIVED by walking the workspace for manifests that are
 * not `private`, so a package added later is covered the moment it exists rather
 * than when someone remembers to extend a list. The copies are held byte-identical
 * to the repository root's, which is what stops two divergent licence texts.
 *
 * The second gate closes the other half: shipped source that points a reader at a
 * repository document (`See SECURITY.md …`) is a dangling pointer unless that
 * document is in the tarball too. Those references are found by SCANNING the
 * packed sources, so a new one is gated without being enumerated here.
 *
 * `files` entries are matched verbatim rather than through a re-implementation of
 * npm's glob semantics: these are top-level filenames, npm packs such an entry
 * exactly, and an exact match cannot quietly widen.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Directories that hold no first-party manifest worth scanning. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.git', 'test-results']);

/** npm ships these from the package directory whatever `files` says. */
const ALWAYS_PACKED = new Set(['README.md', 'package.json']);

/** The licence documents every published package carries, byte-identical to the root's. */
const SHARED_DOCUMENTS = ['LICENSE', 'NOTICE'] as const;

/** Source extensions whose shipped text a consumer reads. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.md'];

interface Manifest {
  name?: string;
  private?: boolean;
  license?: string;
  files?: string[];
}

/** Every `package.json` in the workspace below the repository root. */
function manifestPaths(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      found.push(...manifestPaths(resolve(directory, entry.name)));
    } else if (entry.name === 'package.json' && directory !== repoRoot) {
      found.push(resolve(directory, entry.name));
    }
  }
  return found;
}

function readManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

/** The packages npm would publish: every non-`private` manifest in the workspace. */
const publishable = manifestPaths(repoRoot)
  .map((path) => ({ path, directory: dirname(path), manifest: readManifest(path) }))
  .filter(({ manifest }) => manifest.private !== true)
  .map((entry) => ({
    ...entry,
    label: entry.manifest.name ?? relative(repoRoot, entry.directory).split(sep).join('/'),
  }));

/** Whether `files` (plus npm's own always-packed set) ships a top-level `name`. */
function packs(manifest: Manifest, name: string): boolean {
  return ALWAYS_PACKED.has(name) || (manifest.files ?? []).includes(name);
}

/** Every file under `directory` a consumer could read as shipped text. */
function sourcesWithin(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      found.push(...sourcesWithin(resolve(directory, entry.name)));
    } else if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      found.push(resolve(directory, entry.name));
    }
  }
  return found;
}

/**
 * The repository documents a package's own source points a reader at.
 *
 * Matches the SHOUTING-CASE document names this repository uses at its root
 * (`SECURITY.md`, `CONTRIBUTING.md`, …) — the ones a published file can name and
 * fail to ship. Lower-case prose filenames are not part of that vocabulary.
 */
function referencedDocuments(directory: string): Map<string, string[]> {
  const references = new Map<string, string[]>();
  for (const file of sourcesWithin(directory)) {
    for (const [name] of readFileSync(file, 'utf8').matchAll(/\b[A-Z][A-Z0-9_]*\.md\b/g)) {
      const citing = references.get(name) ?? [];
      citing.push(relative(repoRoot, file).split(sep).join('/'));
      references.set(name, citing);
    }
  }
  return references;
}

describe('published package licences', () => {
  it('finds the packages npm would publish', () => {
    // A walk that matched nothing would make every case below vacuous.
    expect(publishable.map(({ label }) => label).sort()).toEqual([
      '@tai42/api-client',
      '@tai42/studio-sdk',
    ]);
  });

  it('carries an Apache-2.0 licence at the repository root', () => {
    const licence = readFileSync(resolve(repoRoot, 'LICENSE'), 'utf8');
    expect(licence).toContain('Apache License');
    expect(licence).toContain('Version 2.0, January 2004');
    // §4(d): the NOTICE text is a distinct obligation from the licence itself.
    expect(readFileSync(resolve(repoRoot, 'NOTICE'), 'utf8')).toContain('Apache License');
  });

  it.each(publishable)('$label declares the licence it ships', ({ manifest }) => {
    expect(manifest.license).toBe('Apache-2.0');
  });

  it.each(
    publishable.flatMap((entry) => SHARED_DOCUMENTS.map((document) => ({ ...entry, document }))),
  )('$label ships $document in its tarball', ({ directory, manifest, document }) => {
    const shipped = join(directory, document);
    expect({ path: relative(repoRoot, shipped), exists: existsSync(shipped) }).toEqual({
      path: relative(repoRoot, shipped),
      exists: true,
    });
    // Byte-identical to the root's, so the two copies cannot drift into two
    // different statements of the same licence.
    expect(readFileSync(shipped, 'utf8')).toBe(readFileSync(resolve(repoRoot, document), 'utf8'));
    // Present on disk is not shipped: `files` is an allow-list, and npm packs a
    // top-level licence by name only — NOTICE it does not pack on its own.
    expect({ document, packed: packs(manifest, document) }).toEqual({ document, packed: true });
  });

  it.each(publishable)(
    '$label ships every document its own source cites',
    ({ directory, manifest, label }) => {
      const dangling = [...referencedDocuments(directory)]
        .filter(([name]) => !(existsSync(join(directory, name)) && packs(manifest, name)))
        .map(([name, citing]) => ({ name, citing }));
      expect({ package: label, dangling }).toEqual({ package: label, dangling: [] });
    },
  );
});
