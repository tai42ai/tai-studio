/**
 * @tai42/feature-connectors — the connectors surface: providers, connections, and
 * the OAuth popup flow.
 */
export { ConnectorsPage } from './connectors-page';
export { ConnectDialog } from './connect-dialog';
export { ConnectionDetail } from './connection-detail';
export { Notice } from './notice';
export { useOAuthPopup, OAUTH_MESSAGE_TYPE } from './oauth';
export type { OAuthNotice, UseOAuthPopupOptions, UseOAuthPopupResult } from './oauth';
export { PROVIDERS_KEY, CONNECTIONS_KEY, connectionKey } from './keys';
