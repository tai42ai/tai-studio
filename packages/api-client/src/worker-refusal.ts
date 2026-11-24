/**
 * The refusals a worker answers at its door before a change begins, each a retriable `503`
 * carrying its own envelope: the reload gate held (`{ error, reloading: true }`), or the worker
 * leaving (`{ error, leaving }`). A `503` without either envelope did not come from that door.
 */
import { ApiError } from './errors';
import { leavingError, reloadingError } from './generated/openapi-schemas';

/** Whether `error` is the reload gate's refusal: a `503` whose body is the reloading envelope. */
export const isReloadingError = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 503 && reloadingError.safeParse(error.body).success;

/**
 * Whether `error` is a leaving worker's refusal: a `503` whose body is the leaving envelope. The
 * worker begins no change; another worker takes the same request.
 */
export const isWorkerLeavingError = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 503 && leavingError.safeParse(error.body).success;
