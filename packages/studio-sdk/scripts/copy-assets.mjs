// Copy the precompiled design-system stylesheets into dist so the built barrel
// (dist/index.js does `import './components/tokens.css'` and friends) is
// self-contained for every consumer — feature/shell Vite builds and Vitest alike.
// `tsc -b` emits only JS/.d.ts, so this step ships the CSS assets alongside them.
//
// Every stylesheet under src/ is copied at its source-relative path, and the copy
// is GATED: a stylesheet that no module imports would ship silently dead, and one
// missing from dist/ would vanish from the published package with nothing to
// catch it. Both conditions fail the build loudly.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

// The specifiers every TypeScript module side-effect-imports, so an unreferenced
// stylesheet is caught here rather than by its absence from a running page.
const importedSpecifiers = new Set();
for (const module of filesWithin(srcDir, ['.ts', '.tsx'])) {
  const source = readFileSync(module, 'utf8');
  for (const match of source.matchAll(/import\s+'([^']+\.css)'/g)) {
    importedSpecifiers.add(posixRelative(srcDir, resolve(dirname(module), match[1])));
  }
}

const unimported = [];
for (const stylesheet of stylesheets) {
  const sourceRelative = posixRelative(srcDir, stylesheet);
  // A stylesheet pulled in by another stylesheet's @import needs no module
  // import of its own — the importing sheet carries it.
  const importedByStylesheet = stylesheets.some(
    (other) =>
      other !== stylesheet &&
      readFileSync(other, 'utf8').includes(`'${posixRelative(dirname(other), stylesheet)}'`),
  );
  if (!importedSpecifiers.has(sourceRelative) && !importedByStylesheet) {
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

const missing = stylesheets
  .map((stylesheet) => posixRelative(srcDir, stylesheet))
  .filter((sourceRelative) => {
    try {
      return !statSync(resolve(distDir, sourceRelative)).isFile();
    } catch {
      return true;
    }
  });

if (missing.length > 0) {
  throw new Error(`Stylesheet(s) missing from dist/ after the copy step: ${missing.join(', ')}.`);
}

// A stylesheet a consumer cannot address by subpath is only half-published: the
// barrel delivers it, but `@tai42/studio-sdk/<name>.css` 404s. The exports map
// is hand-written, so it is checked against the same file list.
const exported = new Set(
  Object.values(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).exports).filter(
    (target) => typeof target === 'string' && target.endsWith('.css'),
  ),
);

const unexported = stylesheets
  .map((stylesheet) => `./dist/${posixRelative(srcDir, stylesheet)}`)
  .filter((distPath) => !exported.has(distPath));

if (unexported.length > 0) {
  throw new Error(
    `Stylesheet(s) absent from the package "exports" map, so no consumer can import them by subpath: ${unexported.join(', ')}.`,
  );
}
