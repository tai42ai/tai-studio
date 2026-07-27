// Copy the precompiled design-system stylesheets into dist so the built barrel
// (dist/index.js does `import './components/tokens.css'` and friends) is
// self-contained for every consumer — feature/shell Vite builds and Vitest alike.
// `tsc -b` emits only JS/.d.ts, so this step ships the CSS assets alongside them.
//
// Every stylesheet under src/ is copied at its source-relative path, and the copy
// is GATED IN BOTH DIRECTIONS, because `tsc -b` never cleans dist/ and this script
// only ever writes:
//   src/ -> dist/  a stylesheet no module imports would ship silently dead; one
//                  whose dist/ copy is absent or stale would publish CSS that does
//                  not match its source; one absent from the exports map cannot be
//                  imported by subpath.
//   dist/ -> src/  a stylesheet that was RENAMED or DELETED leaves its old dist/
//                  copy behind, and `files: ["dist"]` publishes it — together with
//                  an exports subpath that still resolves to it. So a dist/ copy
//                  with no live source, and a `*.css` exports subpath with no live
//                  source behind it, are errors too.
// Every one of these fails the build loudly.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = resolve(root, 'src');
const distDir = resolve(root, 'dist');

/** Every file under `dir` whose name ends with one of `extensions`, recursively. */
function filesWithin(dir, extensions) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesWithin(full, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

/** A source-relative path in the POSIX form a module specifier uses. */
function posixRelative(from, to) {
  return relative(from, to).split(sep).join('/');
}

const stylesheets = filesWithin(srcDir, ['.css']);
if (stylesheets.length === 0) {
  throw new Error(`No stylesheet found under ${srcDir}; the design system ships at least one.`);
}

// A bare CSS import in either quote form — `import './x.css'` and
// `import "./x.css"` are the same import to a bundler, so both count here and in
// the sibling `sideEffects` gate (package-side-effects.test.ts).
const MODULE_CSS_IMPORT = /import\s+['"]([^'"]+\.css)['"]/g;
// A stylesheet's own `@import`, in every form CSS allows it: either quote, with
// or without the `url()` wrapper.
const STYLESHEET_IMPORT = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g;

// The specifiers every TypeScript module side-effect-imports, so an unreferenced
// stylesheet is caught here rather than by its absence from a running page.
const importedSpecifiers = new Set();
for (const module of filesWithin(srcDir, ['.ts', '.tsx'])) {
  const source = readFileSync(module, 'utf8');
  for (const match of source.matchAll(MODULE_CSS_IMPORT)) {
    importedSpecifiers.add(posixRelative(srcDir, resolve(dirname(module), match[1])));
  }
}

// A stylesheet pulled in by another stylesheet's @import needs no module import
// of its own — the importing sheet carries it. Every specifier is resolved
// against the importing sheet; a bare package specifier (`@fontsource-variable/…`)
// resolves to a path no source stylesheet occupies and so simply does not match.
const importedByStylesheet = new Set();
for (const stylesheet of stylesheets) {
  for (const match of readFileSync(stylesheet, 'utf8').matchAll(STYLESHEET_IMPORT)) {
    const target = resolve(dirname(stylesheet), match[1]);
    // A sheet importing itself carries nothing; it must still be reached from a
    // module or it is dead.
    if (target !== stylesheet) importedByStylesheet.add(target);
  }
}

const unimported = [];
for (const stylesheet of stylesheets) {
  const sourceRelative = posixRelative(srcDir, stylesheet);
  if (!importedSpecifiers.has(sourceRelative) && !importedByStylesheet.has(stylesheet)) {
    unimported.push(sourceRelative);
    continue;
  }
  const target = resolve(distDir, sourceRelative);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(stylesheet, target);
}

if (unimported.length > 0) {
  throw new Error(
    `Stylesheet(s) not imported by any module or stylesheet under src/, so they would ship dead: ${unimported.join(', ')}. ` +
      `Add a side-effect import to src/index.ts (the barrel is what delivers CSS to consumers).`,
  );
}

// Post-condition: what is in dist/ is the source, byte for byte. A stale copy
// left by an earlier build, or a copy that did not land, would publish a package
// whose CSS does not match its own sources.
const stale = stylesheets
  .map((stylesheet) => posixRelative(srcDir, stylesheet))
  .filter((sourceRelative) => {
    const copied = resolve(distDir, sourceRelative);
    if (!existsSync(copied)) return true;
    return !readFileSync(copied).equals(readFileSync(resolve(srcDir, sourceRelative)));
  });

if (stale.length > 0) {
  throw new Error(
    `Stylesheet(s) missing from dist/ or not matching their source after the copy step: ${stale.join(', ')}.`,
  );
}

// The reverse: nothing may sit in dist/ that no source stylesheet puts there. A
// rename or a deletion in src/ leaves the old copy untouched — this script only
// writes, and `tsc -b` cleans nothing — and `files: ["dist"]` would publish it.
const liveSourceRelative = new Set(
  stylesheets.map((stylesheet) => posixRelative(srcDir, stylesheet)),
);

const orphaned = existsSync(distDir)
  ? filesWithin(distDir, ['.css'])
      .map((copied) => posixRelative(distDir, copied))
      .filter((distRelative) => !liveSourceRelative.has(distRelative))
  : [];

if (orphaned.length > 0) {
  throw new Error(
    `Stylesheet(s) in dist/ with no source under src/, left by an earlier build of a since-renamed or deleted file and published by files: ["dist"]: ${orphaned.join(', ')}. ` +
      `Delete dist/ and rebuild.`,
  );
}

// A stylesheet a consumer cannot address by subpath is only half-published: the
// barrel delivers it, but `@tai42/studio-sdk/<name>.css` 404s. The exports map
// is hand-written, so it is checked against the same file list — in both
// directions, since a subpath left behind by a rename keeps resolving, and would
// serve whatever stale copy is still sitting in dist/.
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const cssExports = Object.entries(manifest.exports).filter(
  ([, target]) => typeof target === 'string' && target.endsWith('.css'),
);
const exported = new Set(cssExports.map(([, target]) => target));

const unexported = stylesheets
  .map((stylesheet) => `./dist/${posixRelative(srcDir, stylesheet)}`)
  .filter((distPath) => !exported.has(distPath));

if (unexported.length > 0) {
  throw new Error(
    `Stylesheet(s) absent from the package "exports" map, so no consumer can import them by subpath: ${unexported.join(', ')}.`,
  );
}

const DIST_PREFIX = './dist/';
const unbackedExports = cssExports
  .filter(
    ([, target]) =>
      !target.startsWith(DIST_PREFIX) || !liveSourceRelative.has(target.slice(DIST_PREFIX.length)),
  )
  .map(([subpath, target]) => `${subpath} -> ${target}`);

if (unbackedExports.length > 0) {
  throw new Error(
    `Package "exports" subpath(s) pointing at a stylesheet no source under src/ produces: ${unbackedExports.join(', ')}. ` +
      `Remove the entry, or restore the source it names.`,
  );
}
