/**
 * Every brand mark shipped in `public/` is wired from `index.html`.
 *
 * Vite copies `public/` verbatim to the built SPA root, so a file that lands there
 * is served unauthenticated at the deployment origin whether or not anything asks
 * for it. A mark nothing references is dead payload in every deployment, and — the
 * worse half — a `README` sentence claiming something selects it is a false
 * statement about the running product, which is exactly the kind of claim a reader
 * has no way to check.
 *
 * The image set is DERIVED by reading `public/`, so a mark added later is gated the
 * moment it exists rather than when someone remembers to extend a list. It checks
 * the SOURCE tree, not `dist`: `dist` is build output a test run cannot assume
 * exists, and the `public/` → root copy is Vite's own contract.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = resolve(appRoot, 'public');

/** Every image `public/` serves, by filename. */
function publicImages(): string[] {
  return readdirSync(publicDir)
    .filter((entry) => /\.(png|svg|ico|webp)$/.test(entry))
    .sort();
}

function indexHtml(): string {
  return readFileSync(resolve(appRoot, 'index.html'), 'utf8');
}

describe('brand marks served from public/', () => {
  it('reads the directory (a gate over an empty list would pass vacuously)', () => {
    expect(publicImages()).toEqual([
      'apple-touch-icon.png',
      'tai42-logo-icon-dark.png',
      'tai42-logo-icon.png',
    ]);
  });

  it('wires every served image from index.html', () => {
    // The shell mounts into this document; nothing else on the deployment root
    // requests these files. An unreferenced one is bytes served to anyone who asks
    // and used by no one.
    const html = indexHtml();
    const unreferenced = publicImages().filter((name) => !html.includes(`/${name}`));
    expect(unreferenced).toEqual([]);
  });

  it('selects the dark mark by color scheme, behind the unqualified fallback', () => {
    // A second `rel="icon"` without a `media` predicate is not a dark mark — it is a
    // coin flip between two icons. And the unqualified link has to come FIRST, so a
    // browser that ignores `media` on an icon link keeps the light mark rather than
    // landing on a mark drawn for a ground it is not on.
    const html = indexHtml();
    const iconLinks = [...html.matchAll(/<link\b[^>]*\brel="icon"[^>]*>/gs)].map(
      (match) => match[0],
    );
    expect(iconLinks).toHaveLength(2);

    const [fallback, dark] = iconLinks as [string, string];
    expect(fallback).toContain('/tai42-logo-icon.png');
    expect(fallback).not.toContain('media=');
    expect(dark).toContain('/tai42-logo-icon-dark.png');
    expect(dark).toContain('media="(prefers-color-scheme: dark)"');
  });
});
