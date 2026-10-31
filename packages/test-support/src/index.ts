/**
 * Helpers shared by the workspace's tests. A test-only package: ESLint lets a feature reach
 * it from test code alone, and it is never built or published.
 */
import { type ApiClient, createApiClient } from '@tai42/api-client';

const { holdersFromError, storedPresetFaultFromError, isMcpStartingError, isMcpNotLoadedError } =
  createApiClient({ getToken: () => null });

/**
 * The refusal readers of a real client. A stub client carries them, so a refused write reads
 * exactly as it reads with the served client.
 */
export const refusalReaders: Pick<
  ApiClient,
  'holdersFromError' | 'storedPresetFaultFromError' | 'isMcpStartingError' | 'isMcpNotLoadedError'
> = { holdersFromError, storedPresetFaultFromError, isMcpStartingError, isMcpNotLoadedError };
