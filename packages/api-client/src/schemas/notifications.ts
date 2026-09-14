/** Notification-sink record response schemas. */
import { z } from 'zod';
import { channelTemplate } from './served';

// The internal notifications sink: the messages the `notify_user` operation records
// with no channel, so they land only in the Studio inbox. Each record carries the
// server-minted id + timestamp; `recipient` is null when the message names none.
// The sink also stores the richer-send forms a notify carried — `media`
// (images/links shown WITH the message), `template` (a pre-approved out-of-window
// send), `options` (tappable option labels) — plus the `audience` identity the
// record is addressed to; the inbox renders them.

export const notification = z.object({
  id: z.string(),
  message: z.string(),
  // A channel DELIVERY address the message went to; null when the send named none.
  recipient: z.string().nullable(),
  // The IDENTITY (a user_id) whose in-app inbox the record is addressed to, distinct
  // from `recipient`. `.nullish()` accepts both an older record that predates the
  // field (key omitted) and a broadcast send (explicit null) — both parse to "none".
  audience: z.string().nullish(),
  // Display-only media stored WITH the message (images and/or links). Deliberately
  // LOOSE (`z.array(z.unknown())`), like the interactions frame: each item is
  // `safeParse`d per item by the renderer against `interactionMediaItem`, so one
  // malformed/hostile item is a loud per-item notice, never a whole-feed parse
  // failure that would silently vanish every other notification. `.nullish()` covers
  // an older record (key omitted) and a plain send (explicit null).
  media: z.array(z.unknown()).nullish(),
  // A pre-approved template the notify carried, parsed strictly: a drifting one is a
  // loud feed-level `ApiSchemaError`, consistent with the record contract.
  template: channelTemplate.nullish(),
  // Tappable option labels the notify offered; display-only in the operator inbox
  // (there is no conversation for the sink to enter). Strictly a string list.
  options: z.array(z.string()).nullish(),
  created_at: z.string(),
});
export type Notification = z.infer<typeof notification>;

export const notifications = z.object({
  notifications: z.array(notification),
});
export type Notifications = z.infer<typeof notifications>;
