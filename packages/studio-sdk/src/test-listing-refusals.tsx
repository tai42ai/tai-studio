/**
 * Test helpers for the listing refusals a write can meet: an `ApiError`-shaped refusal
 * carrying the platform's envelope code, the client's readers of the two codes, and a
 * render helper that mounts the tree under an `ApiProvider` whose client carries those
 * readers. Built without importing `@tai42/api-client` at runtime: the SDK depends on its
 * types only.
 */
import type { ApiClient } from '@tai42/api-client';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

import { ApiProvider } from './hooks/useApi';

/** The envelope code of each listing refusal. */
export type ListingRefusalCode = 'mcp-server-starting' | 'mcp-server-not-loaded';

/** A rejected call shaped like the client's `ApiError` for a `503` listing refusal. */
export function listingRefusal(code: ListingRefusalCode, message: string): Error {
  return Object.assign(new Error(message), { name: 'ApiError', status: 503, code });
}

const codeOf = (error: unknown): unknown =>
  typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

/** The client's readers of the two listing refusals, reading the envelope code. */
export const listingRefusalReaders: Pick<ApiClient, 'isMcpStartingError' | 'isMcpNotLoadedError'> =
  {
    isMcpStartingError: (error) => codeOf(error) === 'mcp-server-starting',
    isMcpNotLoadedError: (error) => codeOf(error) === 'mcp-server-not-loaded',
  };

/** Render `ui` under a client that carries {@link listingRefusalReaders} and `client`. */
export function renderWithRefusalReaders(
  ui: ReactElement,
  client: Partial<ApiClient> = {},
): RenderResult {
  const api = { ...listingRefusalReaders, ...client } as unknown as ApiClient;
  return render(<ApiProvider value={api}>{ui}</ApiProvider>);
}
