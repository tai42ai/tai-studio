/**
 * The shell runtime entry. Loads the canonical stylesheet FIRST (tokens + layer
 * order), then the @tai42/jq-studio stylesheet (the visual jq editor's chrome),
 * installs the stale-chunk recovery, and boots the app through ONE dynamic import
 * (`boot.ts`). The entry imports nothing the import map serves, so a vendor module
 * that fails to arrive fails that import, which the boot recovers from or reports,
 * rather than the entry itself.
 */
import './styles.css';
// The visual jq editor's stylesheet, imported ONCE at the root. jq-studio's built
// JS pulls in no CSS at runtime, so a host loads it explicitly; it paints the
// editor chrome that the injected SDK primitives (see JqPrimitivesProvider) don't
// already style.
import '@tai42/jq-studio/styles.css';

import { bootStudio } from './boot';
import { installStaleChunkReload } from './stale-chunk-reload';

// Recover from stale-chunk import failures before anything loads, so the app's own
// import and a failing lazy route during boot both trigger the one-shot reload.
installStaleChunkReload();

void bootStudio({
  loadApp: () => import('./app-entry'),
  root: document.getElementById('root'),
});
