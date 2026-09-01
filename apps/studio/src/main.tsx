/**
 * The shell runtime entry. Loads the canonical stylesheet FIRST (tokens + layer
 * order), then the @tai42/jq-studio stylesheet (the visual jq editor's chrome),
 * builds the production `Studio` (the api-client bound to the live auth token,
 * same-origin by default), and mounts it.
 */
import './styles.css';
// The visual jq editor's stylesheet, imported ONCE at the root. jq-studio's built
// JS pulls in no CSS at runtime, so a host loads it explicitly; it paints the
// editor chrome that the injected SDK primitives (see JqPrimitivesProvider) don't
// already style.
import '@tai42/jq-studio/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installDefaultJqWorker } from '@tai42/jq-studio';
import { createApiClient } from '@tai42/api-client';

import { createStudio } from './app/create-studio';
import { installStaleChunkReload } from './stale-chunk-reload';

// Recover from stale-chunk import failures before anything renders, so even a
// failing lazy route during boot triggers the one-shot reload.
installStaleChunkReload();

// Install the shared jq evaluation worker ONCE at boot, so every JqField in the
// deployment (host feature or plugin page) evaluates its Test panel off the main
// thread through the one worker — a runaway jq program can only block the worker,
// which the client terminates at its deadline, never the UI thread. Without this
// the library falls back to synchronous main-thread evaluation.
installDefaultJqWorker();

const { App } = createStudio({
  createClient: (getToken) =>
    createApiClient({ getToken, baseUrl: import.meta.env.VITE_API_BASE_URL ?? '' }),
});

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('#root element is missing from index.html — the shell cannot mount');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
