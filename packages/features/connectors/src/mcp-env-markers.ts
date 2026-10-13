/**
 * Manifest-shape helpers around the `!ENV ${KEY}` secret references an MCP entry
 * carries (the marker grammar itself is the studio-sdk's `env-markers` module): the
 * leaf at a manifest pointer and whether a record entry is an `env` map entry. The
 * server's shared validator is the authority on danglers.
 */
import type { RecordEntryContext } from '@tai42/studio-sdk';

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
