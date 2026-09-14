/**
 * The `!ENV ${KEY}` wire-marker concern: the manifest stores a secret env reference
 * as an `!ENV ${KEY}` leaf (the `pyaml_env`-resolved marker the preserved read
 * round-trips intact). These map that wire form to/from a bare key name at the
 * SecretRefField boundary; the server's shared validator is the authority on danglers.
 */
import type { RecordEntryContext } from '@tai42/studio-sdk';

export const ENV_MARKER = /^!ENV\s+\$\{([^}]+)\}$/;

/** The referenced env key of an `!ENV ${KEY}` leaf, or `null` for anything else. */
export function parseEnvMarker(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = ENV_MARKER.exec(value);
  return match === null ? null : (match[1] ?? null);
}

/** The `!ENV ${KEY}` leaf that references env key `key`. */
export function formatEnvMarker(key: string): string {
  return `!ENV \${${key}}`;
}

/** Every env key an `!ENV ${KEY}` leaf anywhere under `value` references. */
export function collectEnvRefs(value: unknown): Set<string> {
  const refs = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      const key = parseEnvMarker(node);
      if (key !== null) refs.add(key);
    } else if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (typeof node === 'object' && node !== null) {
      for (const nested of Object.values(node)) walk(nested);
    }
  };
  walk(value);
  return refs;
}

/**
 * The leaf value at a slash-separated manifest pointer (`mcp/0/env/KEY`) — the same
 * pointer form the combined paste op targets — or `undefined` when any segment does
 * not resolve. Array segments index by number; object segments key by name.
 */
export function resolveManifestPointer(root: unknown, pointer: string): unknown {
  let node: unknown = root;
  for (const segment of pointer.split('/')) {
    if (Array.isArray(node)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= node.length) return undefined;
      node = node[index];
    } else if (typeof node === 'object' && node !== null) {
      if (!Object.hasOwn(node, segment)) return undefined;
      node = (node as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return node;
}

/**
 * Whether a record entry belongs to an `env` map (the secret-bearing map on an MCP
 * entry) — its containing record field is named `env`. The renderer mounts the
 * masked SecretRefField for these and the built-in value editor for every other map.
 */
export function isEnvEntry(entry: RecordEntryContext): boolean {
  const boundary = entry.path.lastIndexOf('.');
  if (boundary === -1) return false;
  const parent = entry.path.slice(0, boundary);
  return parent === 'env' || parent.endsWith('.env');
}
