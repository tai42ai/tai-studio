/**
 * The holder kinds the platform itself reports, and the route each one lands on. A
 * plugin may register a link only for a kind outside this table.
 */
import type { ReferenceHolder } from '@tai42/api-client';

import type { RouteSearchByToken, RouteToken } from '../navigation/types';

/** A route token with its search, typed together. */
export type CoreHolderRoute = {
  [T in RouteToken]: { readonly token: T; readonly search: RouteSearchByToken[T] };
}[RouteToken];

/** A locator field the holder's kind always carries; its absence is a malformed holder. */
function locatorField<T extends 'string' | 'number'>(
  holder: ReferenceHolder,
  key: string,
  type: T,
): T extends 'string' ? string : number {
  const value = holder.locator[key];
  if (typeof value !== type) {
    throw new Error(`a “${holder.kind}” holder carries no ${type} locator “${key}”`);
  }
  return value as T extends 'string' ? string : number;
}

const CORE_ROUTES: Readonly<Record<string, (holder: ReferenceHolder) => CoreHolderRoute>> = {
  preset: (h) => ({ token: 'presets', search: { preset: h.name } }),
  'preset version': (h) => ({
    token: 'presets',
    search: { preset: h.name, version: locatorField(h, 'version', 'number') },
  }),
  hook: (h) => ({ token: 'hooks', search: { hook: h.name } }),
  schedule: (h) => ({ token: 'scheduling', search: { schedule: h.name } }),
  'conversation route': (h) => ({ token: 'conversations', search: { route: h.name } }),
  'conversation config': (h) => ({
    token: 'conversations',
    search: { config: `${locatorField(h, 'target_kind', 'string')}:${h.name}` },
  }),
  'tool extensions': () => ({ token: 'manifest', search: {} }),
  'parked interactions': () => ({ token: 'interactions', search: {} }),
  'answered continuations': () => ({ token: 'interactions', search: {} }),
  'state records': () => ({ token: 'states', search: {} }),
  'pending save': () => ({ token: 'states', search: {} }),
  'state declaration': (h) => ({ token: 'states', search: { state: h.name, tab: 'declaration' } }),
  'state template': (h) => ({ token: 'states', search: { template: h.name } }),
  'api key': () => ({ token: 'settings', search: {} }),
  principal: () => ({ token: 'settings', search: {} }),
  role: () => ({ token: 'settings', search: {} }),
  setting: () => ({ token: 'settings', search: {} }),
};

/**
 * A count holder stands for the holders of one kind and tag the caller's role cannot
 * read: its name is the tag and its locator carries only the count. It names no holder,
 * so it has no page to link to.
 */
export function isCountHolder(holder: ReferenceHolder): boolean {
  const keys = Object.keys(holder.locator);
  return (
    holder.name === holder.tag &&
    keys.length === 1 &&
    keys[0] === 'count' &&
    typeof holder.locator.count === 'number'
  );
}

/** Every kind the platform reports; a plugin cannot register a link for one. */
export const CORE_HOLDER_KINDS: ReadonlySet<string> = new Set(Object.keys(CORE_ROUTES));

/** The route a core holder lands on, or `null` for a kind outside the core table. */
export function coreHolderRoute(holder: ReferenceHolder): CoreHolderRoute | null {
  const route = Object.hasOwn(CORE_ROUTES, holder.kind) ? CORE_ROUTES[holder.kind] : undefined;
  return route === undefined ? null : route(holder);
}
