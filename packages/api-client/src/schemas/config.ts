/** Environment-config and config-mode response schemas. */
import { z } from 'zod';

export const envConfig = z.object({
  env: z.record(z.string(), z.string()),
  secret_keys: z.array(z.string()),
});
/**
 * `GET /api/config/mode` — the active config backend mode (`file` / `k8s`). The
 * skeleton emits only `config_mode`; `read_only` is a UI-side gate, tolerated-absent
 * and defaulting to `false` (writable) so a normal response never drifts, while a
 * genuinely read-only deployment can opt in by emitting `read_only: true`.
 */
export const configMode = z.object({
  config_mode: z.string(),
  read_only: z.boolean().default(false),
});
