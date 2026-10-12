/** Notification-sink record response schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

// The internal notifications sink: the messages the `notify_user` operation records
// with no channel, so they land only in the Studio inbox. Each record carries the
// server-minted id + timestamp; `recipient` is the channel DELIVERY address the message
// went to (null when the send named none) and `audience` the IDENTITY (a user_id) whose
// in-app inbox the record is addressed to. The sink also stores the richer-send forms a
// notify carried — `media` (images/links shown WITH the message), `template` (a
// pre-approved out-of-window send), `options`/`sections` (tappable options), `header`,
// `footer`, `location` and `schema` — and the inbox renders them.

export const notification = openapi.notificationRecord;
export type Notification = z.infer<typeof notification>;

export const notifications = openapi.notificationListing;
export type Notifications = z.infer<typeof notifications>;
