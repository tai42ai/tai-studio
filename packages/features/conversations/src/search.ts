/**
 * The page's URL contract: `?route=` picks a route, `?route=&thread=` drills into
 * one thread's transcript, and `?status=&address=&q=` filter the route's threads +
 * search their text. None of the filters — nor a `thread` — names anything the API
 * can be asked for WITHOUT a `route`, and a blank value (`?route=`, `?thread=%20`)
 * names nothing either, so both are repaired away in one pass.
 *
 * The filter type is DERIVED from the SDK route contract (the single source of
 * truth), and the api-client query shapes are projected from it — the same pattern
 * the observability and marketplace filters follow.
 */
import type { RouteSearch } from '@tai42/studio-sdk';
import type { ConversationThreadFilters } from '@tai42/api-client';

export type ConversationsSearch = RouteSearch<'conversations'>;

/** A search value that names something, or `undefined`. Blank is not a name. */
function named(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

/**
 * The legal search a hand-edited or shared URL reduces to: a blank value is read as
 * absent, and a `thread`/`status`/`address`/`q` left without its `route` is dropped
 * with it — none filters or reads anything until a route is picked. Returns the SAME
 * reference when nothing needs repair, so a caller can tell "already legal" from
 * "repaired" by identity alone; a repair is a NEW object every call, so identity
 * says nothing about whether two repairs agree.
 */
export function sanitizeSearch(search: ConversationsSearch): ConversationsSearch {
  const route = named(search.route);
  const scoped = route !== undefined;
  const thread = scoped ? named(search.thread) : undefined;
  const status = scoped ? search.status : undefined;
  const address = scoped ? named(search.address) : undefined;
  const q = scoped ? named(search.q) : undefined;
  if (
    route === search.route &&
    thread === search.thread &&
    status === search.status &&
    address === search.address &&
    q === search.q
  ) {
    return search;
  }
  return { route, thread, status, address, q };
}

/** The thread-list filter set projected onto the api-client query shape. */
export function threadFilters(search: ConversationsSearch): ConversationThreadFilters {
  return { status: search.status, address: named(search.address) };
}

/** The record-text needle (`?q=`), or `undefined` when it is unset/blank. */
export function textQuery(search: ConversationsSearch): string | undefined {
  return named(search.q);
}

/** Merge a partial edit into the current search, dropping keys set to `undefined`. */
export function mergeSearch(
  current: ConversationsSearch,
  patch: Partial<ConversationsSearch>,
): ConversationsSearch {
  const merged: Record<string, unknown> = { ...current, ...patch };
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(merged)) {
    if (merged[key] !== undefined) next[key] = merged[key];
  }
  return next;
}
