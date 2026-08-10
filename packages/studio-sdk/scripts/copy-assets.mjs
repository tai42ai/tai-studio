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
//   dist/ -> src/  a file that was RENAMED or DELETED in src/ leaves its old dist/
//                  output behind, and `files: ["dist"]` publishes it — together with
//                  an exports subpath that still resolves to it. So any dist/ file
//                  with no live source, and a `*.css` exports subpath with no live
//                  source behind it, are errors too.
// Every one of these fails the build loudly.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = resolve(root, 'src');
const distDir = resolve(root, 'dist');

/**
 * Every file under `dir`, recursively: those whose name ends with one of
 * `extensions`, or all of them when `extensions` is omitted.
 */
function filesWithin(dir, extensions) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesWithin(full, extensions));
    } else if (extensions === undefined || extensions.some((ext) => entry.name.endsWith(ext))) {
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

/**
 * `source` with every comment — and, for a module, every template literal —
 * blanked to spaces, newlines kept so line and column stay put. Only a statement
 * delivers a stylesheet, so the scans below run over this rather than over the
 * raw text: the words of an import inside a comment or a backtick string are
 * prose, and a scan that counts them waves through the sheet it exists to catch.
 *
 * Quoted strings are copied through, because an import carries its specifier in
 * one, but a quote never runs past the end of its own line — so a lone quote
 * inside a regular expression can swallow at most that line. A stylesheet has
 * block comments only: there a `//` belongs to a URL and a backtick is an
 * ordinary character.
 */
function executableText(source, dialect) {
  const isModule = dialect === 'module';
  let out = '';
  let mode = 'code';
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    const pair = source.slice(index, index + 2);
    if (mode === 'code') {
      if (pair === '/*') {
        mode = 'block';
        out += '  ';
        index += 2;
        continue;
      }
      if (isModule && pair === '//') {
        mode = 'line';
        out += '  ';
        index += 2;
        continue;
      }
      if (isModule && character === '`') {
        mode = 'template';
        out += ' ';
        index += 1;
        continue;
      }
      if (character === "'" || character === '"') mode = character;
      out += character;
      index += 1;
      continue;
    }
    if (mode === 'block') {
      if (pair === '*/') {
        mode = 'code';
        out += '  ';
        index += 2;
        continue;
      }
      out += character === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }
    if (mode === 'line') {
      if (character === '\n') mode = 'code';
      out += character === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }
    if (mode === 'template') {
      if (character === '\\') {
        // An escaped backtick closes nothing, so the pair is consumed together.
        out += ` ${source[index + 1] === '\n' ? '\n' : ' '}`;
        index += 2;
        continue;
      }
      if (character === '`') mode = 'code';
      out += character === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }
    // Inside a quoted string, `mode` is the quote that opened it.
    if (character === '\\') {
      out += source.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (character === mode || character === '\n') mode = 'code';
    out += character;
    index += 1;
  }
  return out;
}

/**
 * A `tsconfig` exclude glob as a matcher for a package-root-relative POSIX path.
 * A pattern naming a directory covers everything beneath it, as `tsc` reads it.
 */
function excludeMatcher(pattern) {
  let expression = '';
  let index = 0;
  while (index < pattern.length) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        const slashed = pattern[index + 2] === '/';
        expression += slashed ? '(?:.*/)?' : '.*';
        index += slashed ? 3 : 2;
        continue;
      }
      expression += '[^/]*';
      index += 1;
      continue;
    }
    expression += character === '?' ? '[^/]' : character.replace(/[^\w-]/, '\\$&');
    index += 1;
  }
  return new RegExp(`^${expression}(?:/.*)?$`);
}

// A bare CSS import in either quote form — `import './x.css'` and
// `import "./x.css"` are the same import to a bundler, so both count here and in
// the sibling `sideEffects` gate (package-side-effects.test.ts). ANCHORED to the
// start of a line, as that gate is, and read from comment-free text.
const MODULE_CSS_IMPORT = /^\s*import\s+['"]([^'"]+\.css)['"]/gm;
// A stylesheet's own `@import`, in every form CSS allows it: either quote, with
// or without the `url()` wrapper — and, for the same reason, anchored too.
const STYLESHEET_IMPORT = /^\s*@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/gm;

// What counts as test and test-support scaffolding is `tsconfig.build.json`'s
// `exclude`, read rather than restated so the two cannot disagree: a module the
// composite build never emits reaches no consumer, so an import that exists only
// there cannot be what keeps a stylesheet alive.
const buildConfigPath = resolve(root, 'tsconfig.build.json');
const buildConfig = JSON.parse(executableText(readFileSync(buildConfigPath, 'utf8'), 'module'));
const excludedFromBuild = Array.isArray(buildConfig.exclude) ? buildConfig.exclude : [];
if (excludedFromBuild.length === 0) {
  throw new Error(
    `${posixRelative(root, buildConfigPath)} declares no "exclude", so this gate cannot tell a published module from test scaffolding, ` +
      `and an import that ships to nobody would count as keeping a stylesheet alive.`,
  );
}
const unpublishedModule = excludedFromBuild.map(excludeMatcher);

// Every module the build emits, source-relative; the rest is scaffolding.
const publishedModules = filesWithin(srcDir, ['.ts', '.tsx'])
  .map((module) => posixRelative(srcDir, module))
  .filter((sourceRelative) =>
    unpublishedModule.every((matcher) => !matcher.test(`src/${sourceRelative}`)),
  );

// The specifiers every PUBLISHED TypeScript module side-effect-imports, so an
// unreferenced stylesheet is caught here rather than by its absence from a
// running page.
const importedSpecifiers = new Set();
for (const sourceRelative of publishedModules) {
  const module = resolve(srcDir, sourceRelative);
  const source = executableText(readFileSync(module, 'utf8'), 'module');
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
  const source = executableText(readFileSync(stylesheet, 'utf8'), 'stylesheet');
  for (const match of source.matchAll(STYLESHEET_IMPORT)) {
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

// The reverse: nothing may sit in dist/ that no source puts there. A rename or a
// deletion in src/ leaves the old build output untouched — this script only
// writes, and `tsc -b` cleans nothing — and `files: ["dist"]` would publish it.
// This script copies the stylesheets; everything else in dist/ is what `tsc -b`
// emits for a published module, so both are held against the sources behind them
// and a leftover .js or .d.ts is as much an error as a leftover stylesheet.
const liveSourceRelative = new Set(
  stylesheets.map((stylesheet) => posixRelative(srcDir, stylesheet)),
);

const EMITTED_SUFFIXES = ['.js', '.js.map', '.d.ts', '.d.ts.map'];
const expectedInDist = new Set(liveSourceRelative);
for (const sourceRelative of publishedModules) {
  // A declaration source is input only; the build emits nothing for it.
  if (sourceRelative.endsWith('.d.ts')) continue;
  const base = sourceRelative.replace(/\.tsx?$/, '');
  for (const suffix of EMITTED_SUFFIXES) expectedInDist.add(base + suffix);
}

const orphaned = existsSync(distDir)
  ? filesWithin(distDir)
      .map((emitted) => posixRelative(distDir, emitted))
      .filter((distRelative) => !expectedInDist.has(distRelative))
  : [];

if (orphaned.length > 0) {
  throw new Error(
    `File(s) in dist/ with no source under src/, left by an earlier build of a since-renamed or deleted file and published by files: ["dist"]: ${orphaned.join(', ')}. ` +
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
