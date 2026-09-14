/** The shared transport seam every sub-client method flows through. */
import type { ApiConfig } from '../http';
import { apiRequest } from '../http';

/**
 * Build the per-request transport for one client: the bound `config` and the
 * `req` chokepoint that validates every response against its schema.
 */
export function makeTransport(config: ApiConfig) {
  const req = <S extends Parameters<typeof apiRequest>[2]>(
    path: string,
    schema: S,
    options?: Parameters<typeof apiRequest>[3],
  ) => apiRequest(config, path, schema, options);
  return { config, req };
}

export type Transport = ReturnType<typeof makeTransport>;
