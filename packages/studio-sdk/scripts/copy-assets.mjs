// Copy the precompiled design-system stylesheet into dist so the built barrel
// (dist/index.js does `import './components/tokens.css'`) is self-contained for
// every consumer — feature/shell Vite builds and Vitest alike. `tsc -b` emits
// only JS/.d.ts, so this step ships the CSS asset alongside them.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'src/components/tokens.css');
const to = resolve(root, 'dist/components/tokens.css');
mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
