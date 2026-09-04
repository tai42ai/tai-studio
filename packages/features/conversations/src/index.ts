/**
 * @tai42/feature-conversations — the cross-channel conversation monitor.
 *
 * `ConversationsPage` is the shell-mounted page. The three drill levels, the
 * master/detail pane pairing the last two, the exchange row a transcript is
 * built from, and the search sanitizer are exported for direct unit testing.
 */
export { ConversationsPage } from './ConversationsPage';
export { RoutesTable } from './RoutesTable';
export { RouteFormDialog } from './RouteFormDialog';
export { RouteThreads } from './RouteThreads';
export { EntryGate } from './EntryGate';
export { ThreadList } from './ThreadList';
export { ThreadMode } from './ThreadMode';
export { Transcript } from './Transcript';
export { ComposeMessage } from './ComposeMessage';
export { Exchange } from './Exchange';
export { ConversationFilters } from './ConversationFilters';
export { MessageSearch } from './MessageSearch';
export { sanitizeSearch, threadFilters, textQuery, mergeSearch } from './search';
export type { ConversationsSearch } from './search';
