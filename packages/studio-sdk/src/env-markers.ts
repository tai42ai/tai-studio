/**
 * The `!ENV ${VAR[:default]}` manifest marker grammar the platform reads: a string leaf
 * that begins with the `!ENV ` prefix (the tag and exactly one space) references an
 * environment variable by name, never its value. A variable name carries no `{`, `}` or
 * `:`; an optional `:default` follows it.
 */

/** The prefix that makes a string leaf an `!ENV` marker. */
export const ENV_MARKER_PREFIX = '!ENV ';

/** A leaf that is exactly one reference: group 1 the name, group 2 the optional default. */
const SINGLE_REF = /^!ENV \$\{([^}{:]+)(?::([^}]+))?\}$/;

/** Every reference inside a marker leaf's expression. */
const ANY_REF = /\$\{([^}{:]+)(?::[^}]+)?\}/g;

/** The reference of a single-reference marker leaf. */
export interface EnvRef {
  readonly key: string;
  /** The `:default` text (without the leading colon); absent for a bare reference. */
  readonly default?: string;
}

/** The reference of `value` when it is exactly `!ENV ${KEY}` or `!ENV ${KEY:default}`, else `null`. */
export function parseEnvMarker(value: unknown): EnvRef | null {
  if (typeof value !== 'string') return null;
  const match = SINGLE_REF.exec(value);
  if (match === null) return null;
  const key = match[1] ?? '';
  const defaultText = match[2];
  return defaultText === undefined ? { key } : { key, default: defaultText };
}

/**
 * The marker referencing `key`, carrying `defaultValue` when given. Throws when
 * {@link parseEnvMarker} would not read the marker back as `(key, defaultValue)`: a name is
 * non-empty and carries no `{`, `}` or `:`; a default is non-empty and carries no `}`.
 */
export function formatEnvMarker(key: string, defaultValue?: string): string {
  const marker =
    defaultValue === undefined
      ? `${ENV_MARKER_PREFIX}\${${key}}`
      : `${ENV_MARKER_PREFIX}\${${key}:${defaultValue}}`;
  const parsed = parseEnvMarker(marker);
  if (parsed?.key !== key || parsed.default !== defaultValue) {
    throw new Error(
      `var ${JSON.stringify(key)} with default ${JSON.stringify(defaultValue)} cannot be written as an !ENV marker: a name is non-empty without '{', '}' or ':', a default is non-empty without '}'`,
    );
  }
  return marker;
}

/** Every variable name any marker leaf anywhere under `value` references. */
export function collectEnvRefs(value: unknown): Set<string> {
  const refs = new Set<string>();
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (!node.startsWith(ENV_MARKER_PREFIX)) return;
      for (const match of node.slice(ENV_MARKER_PREFIX.length).matchAll(ANY_REF)) {
        if (match[1] !== undefined) refs.add(match[1]);
      }
    } else if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (typeof node === 'object' && node !== null) {
      for (const nested of Object.values(node)) walk(nested);
    }
  };
  walk(value);
  return refs;
}
