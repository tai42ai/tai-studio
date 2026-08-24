/**
 * The shell runtime entry. Loads the canonical stylesheet FIRST (tokens + layer
 * order), builds the production `Studio` (the api-client bound to the live
 * auth token, same-origin by default), and mounts it.
 */
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createApiClient } from '@tai42/api-client';

import { createStudio } from './app/create-studio';
import { installStaleChunkReload } from './stale-chunk-reload';

// Recover from stale-chunk import failures before anything renders, so even a
// failing lazy route during boot triggers the one-shot reload.
installStaleChunkReload();

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
