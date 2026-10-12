/**
 * Pure helpers for the "Add MCP server" and "Client credentials" dialogs: the address
 * rule checked before a look-up, the name and identifier rules, scope parsing, the add
 * request, the issuer's host for display, and which sign-in service the credentials
 * form starts on. The server stays the authority on every rule checked here.
 */
import type { AddServerArgs, DiscoveredServer } from '@tai42/api-client';

export const ADDRESS_ERROR = 'Enter an https address.';
export const NAME_ERROR = 'A name is required.';
export const IDENTIFIER_ERROR =
  'Use lowercase letters, digits and underscores, starting with a letter.';

/** The hosts on which a plain `http:` server address is accepted. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

/** The platform's provider-id rule: a lowercase letter, then lowercase letters, digits or `_`. */
const IDENTIFIER_RULE = /^[a-z][a-z0-9_]*$/;

/** The field error for a server address, or `null` when it is a parseable https address
 * (or `http:` on localhost / 127.0.0.1). */
export function addressError(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return ADDRESS_ERROR;
  }
  if (url.protocol === 'https:') return null;
  if (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)) return null;
  return ADDRESS_ERROR;
}

/** The field error for a provider name, or `null` when one is given. */
export function nameError(value: string): string | null {
  return value.trim() === '' ? NAME_ERROR : null;
}

/** The field error for a provider identifier, or `null` when it meets the slug rule. */
export function identifierError(value: string): string | null {
  return IDENTIFIER_RULE.test(value.trim()) ? null : IDENTIFIER_ERROR;
}

/** The scopes typed into one space-separated field. */
export function parseScopes(text: string): string[] {
  return text.split(/\s+/).filter((scope) => scope !== '');
}

/** The add request for the looked-up address and the reviewed fields. */
export function buildAddServerArgs(input: {
  readonly url: string;
  readonly name: string;
  readonly identifier: string;
  readonly scopes: string;
}): AddServerArgs {
  return {
    url: input.url,
    id: input.identifier.trim(),
    display_name: input.name.trim(),
    scopes: parseScopes(input.scopes),
  };
}

/** The host (with its port, when it has one) of a sign-in service's address. */
export function issuerHost(issuer: string): string {
  return new URL(issuer).host;
}

/**
 * The sign-in service the credentials form starts on, and the service stored
 * credentials were set for when the server no longer lists it.
 *
 * A server that lists one service uses it. Among several, the stored credentials'
 * service is preselected while it is still listed — so changing a secret never moves
 * the app — and nothing is preselected otherwise.
 */
export function signInChoice(lookup: DiscoveredServer): {
  readonly issuer: string | null;
  readonly unlisted: string | null;
} {
  const listed = lookup.authorization_servers;
  const stored = lookup.client_issuer;
  const unlisted = stored !== null && !listed.includes(stored) ? stored : null;
  if (listed.length === 1) return { issuer: listed[0] ?? null, unlisted };
  return { issuer: stored !== null && unlisted === null ? stored : null, unlisted };
}
