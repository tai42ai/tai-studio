/**
 * @tai42/feature-conversations — the cross-channel conversation monitor.
 *
 * `ConversationsPage` is the shell-mounted page. The three drill levels, the
 * master/detail pane pairing the last two, the exchange row a transcript is
 * built from, and the search sanitizer are exported for direct unit testing.
 */
export { ConversationsPage } from './ConversationsPage';
export { RoutesTable } from './RoutesTable';
export { RouteThreads } from './RouteThreads';
export { ThreadList } from './ThreadList';
export { Transcript } from './Transcript';
export { Exchange } from './Exchange';
export { sanitizeSearch } from './search';
export type { ConversationsSearch } from './search';
