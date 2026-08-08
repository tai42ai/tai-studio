/**
 * The page's URL contract: `?route=` picks a route, `?route=&thread=` drills into
 * one thread's transcript. Neither a `thread` without its `route` nor a blank
 * value (`?route=`, `?thread=%20`) names anything the API can be asked for, so
 * neither is a state the page renders — both are repaired, in one pass.
 */
import type { RouteSearch } from '@tai42/studio-sdk';

export type ConversationsSearch = RouteSearch<'conversations'>;

/** A search value that names something, or `undefined`. Blank is not a name. */
function named(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

/**
 * The legal search a hand-edited or shared URL reduces to: a blank value is read
 * as absent, and a `thread` left without its `route` is dropped with it. Returns
 * the SAME reference when nothing needs repair, so a caller can tell "already
 * legal" from "repaired" by identity alone; a repair is a NEW object every call,
 * so identity says nothing about whether two repairs agree.
 */
export function sanitizeSearch(search: ConversationsSearch): ConversationsSearch {
  const route = named(search.route);
  const thread = route === undefined ? undefined : named(search.thread);
  if (route === search.route && thread === search.thread) return search;
  return { route, thread };
}
