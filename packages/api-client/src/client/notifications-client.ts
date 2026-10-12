/** Notification-sink listing sub-client. */
import { apiRoutes } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

export function notificationsClient(t: Transport) {
  const { req } = t;
  return {
    // The internal notifications sink, newest-first — the messages the `notify_user`
    // operation records with no channel, so they surface only in this inbox.
    listNotifications: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_notifications.path, s.notifications, { signal }),
  };
}
