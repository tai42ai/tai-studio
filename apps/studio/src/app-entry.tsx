/**
 * The app the boot loads (`boot.ts`, through the entry's one dynamic import):
 * builds the production `Studio` (the api-client bound to the live auth token,
 * same-origin by default) and mounts it. Every import-map module the shell uses
 * is reached from here, never from the entry.
 */
import { createApiClient } from '@tai42/api-client';
import { installDefaultJqWorker } from '@tai42/jq-studio';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createStudio } from './app/create-studio';

export function mountStudio(root: HTMLElement): void {
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

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
