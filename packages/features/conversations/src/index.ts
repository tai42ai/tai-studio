/**
 * @tai42/feature-conversations — the cross-channel conversation monitor.
 *
 * `ConversationsPage` is the shell-mounted page. The three drill levels, the
 * master/detail pane pairing the last two, the exchange row a transcript is
 * built from, and the search sanitizer are exported for direct unit testing.
 */
export { ComposeMessage } from './ComposeMessage';
export { ConfigFormDialog } from './ConfigFormDialog';
export { ConfigsTable } from './ConfigsTable';
export { ConversationFilters } from './ConversationFilters';
export { ConversationsPage } from './ConversationsPage';
export { EntryGate } from './EntryGate';
export { Exchange } from './Exchange';
export { FailedMessages } from './FailedMessages';
export { MessageSearch } from './MessageSearch';
export { RouteFormDialog } from './RouteFormDialog';
export { RoutesTable } from './RoutesTable';
export { RouteThreads } from './RouteThreads';
export type { ConversationsSearch } from './search';
export { mergeSearch, sanitizeSearch, textQuery, threadFilters } from './search';
export { ThreadActions } from './ThreadActions';
export { ThreadList } from './ThreadList';
export { ThreadMode } from './ThreadMode';
export { Transcript } from './Transcript';
