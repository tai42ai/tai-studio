/**
 * Helpers shared by the workspace's tests. A test-only package: ESLint lets a feature reach
 * it from test code alone, and it is never built or published.
 */
import { type ApiClient, ApiError, createApiClient } from '@tai42/api-client';

const {
  holdersFromError,
  storedPresetFaultFromError,
  isMcpStartingError,
  isMcpNotLoadedError,
  failedReplyRoll,
} = createApiClient({ getToken: () => null });

/**
 * The refusal readers of a real client. A stub client carries them, so a refused write reads
 * exactly as it reads with the served client.
 */
export const refusalReaders: Pick<
  ApiClient,
  | 'holdersFromError'
  | 'storedPresetFaultFromError'
  | 'isMcpStartingError'
  | 'isMcpNotLoadedError'
  | 'failedReplyRoll'
> = {
  holdersFromError,
  storedPresetFaultFromError,
  isMcpStartingError,
  isMcpNotLoadedError,
  failedReplyRoll,
};

/** What the operator reads of {@link failureWithRoll}: its message, and the roll's heading. */
export const ROLL_FAILURE_MESSAGE = 'Internal Server Error';
export const ROLL_FAILURE_HEADING = '1 worker has settings it has not applied';

/**
 * A write's failed reply carrying a recycle roll: the masked body, whose worker awaiting a
 * respawn has no broadcast row and no roll line.
 */
export function failureWithRoll(status = 500): ApiError {
  return new ApiError(ROLL_FAILURE_MESSAGE, status, undefined, undefined, {
    error: ROLL_FAILURE_MESSAGE,
    error_id: 'err-1',
    recycle: null,
    awaiting_respawn: [{ name: 'serve-a', keys: ['TAI_KEY'] }],
    roll_deferred: false,
    roll_deferred_to: null,
  });
}

/**
 * Matches the report heading whose whole text, its scope included, reads `text`. The scope sits in
 * its own element, so the heading is read from its text content.
 */
export const reportHeading =
  (text: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.tagName === 'STRONG' && element.textContent === text;
