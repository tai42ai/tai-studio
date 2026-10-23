/**
 * The route form's `reply_texts` group: the route's own words for the platform's fixed
 * participant replies, read from the contract's published `ReplyTexts` document, and the
 * mappers between the form's sub-value and the wire catalogue.
 */
import type { ConversationRouteCreate, ConversationRouteView } from '@tai42/api-client';
import type { JsonSchema } from '@tai42/studio-sdk';

import { documentConstraints, REPLY_TEXTS } from './route-document';

/** One `reply_texts` member: the platform's fixed reply it words, and when that reply is sent. */
interface ReplyTextMember {
  readonly name: keyof typeof REPLY_TEXTS.properties;
  readonly title: string;
  readonly description: string;
}

/** The `reply_texts` members, in the order the form draws them. */
export const REPLY_TEXT_MEMBERS: readonly ReplyTextMember[] = [
  {
    name: 'error',
    title: 'Failed turn',
    description: 'Sent when a turn fails and the target gave no reply of its own.',
  },
  {
    name: 'slow_down',
    title: 'Slow down',
    description: 'Sent when an address is over the turn rate.',
  },
  {
    name: 'pairing_code',
    title: 'Pairing code',
    description:
      'The /link reply carrying a fresh code. It must contain {pairing_code} (the code) and may contain {expires_at} (when the code expires).',
  },
  {
    name: 'pairing_code_invalid',
    title: 'Pairing code refused',
    description: 'Sent when a pairing code is refused.',
  },
  {
    name: 'pairing_linked',
    title: 'Linked',
    description: 'Sent when a pairing code is redeemed and the two addresses are linked.',
  },
  {
    name: 'pairing_unlinked',
    title: 'Unlinked',
    description: 'Sent when /unlink detaches the address.',
  },
  {
    name: 'pairing_not_linked',
    title: 'Not linked',
    description: 'Sent when /unlink comes from an address linked to nothing.',
  },
  {
    name: 'pairing_link_unavailable',
    title: 'Link unavailable',
    description:
      'Sent when a pairing code is redeemed while a person it would link is being erased.',
  },
  {
    name: 'pairing_unlink_unavailable',
    title: 'Unlink unavailable',
    description: 'Sent when /unlink comes while the person is being erased.',
  },
  {
    name: 'rejected_unsupported_type',
    title: 'Unsupported message',
    description: 'Sent for an inbound message the channel cannot carry.',
  },
  {
    name: 'rejected_too_large',
    title: 'File too large',
    description: 'Sent for an inbound file over the size cap.',
  },
  {
    name: 'rejected_could_not_receive',
    title: 'File not received',
    description: 'Sent for an inbound file the channel could not fetch.',
  },
];

/** A reply-text member name. */
export type ReplyTextName = ReplyTextMember['name'];

/** The form's `reply_texts` sub-value: the members the operator filled in. */
export type ReplyTextsValue = Partial<Record<ReplyTextName, string>>;

/** The form path of one `reply_texts` member. */
export function replyTextPath(name: ReplyTextName): string {
  return `reply_texts.${name}`;
}

/**
 * The `reply_texts` property — the route's own words for the platform's fixed participant
 * replies. A nested plain object, every field optional: an unset field is the built-in
 * English reply, and a catalogue with nothing set is sent as no catalogue.
 */
export function replyTextsProperty(): JsonSchema {
  return {
    title: 'Reply texts',
    type: 'object',
    description:
      "The route's own words for the replies the platform sends on its own, in the line's language. Leave a field blank for the built-in English reply.",
    properties: Object.fromEntries(
      REPLY_TEXT_MEMBERS.map((member) => [
        member.name,
        {
          ...documentConstraints(REPLY_TEXTS.properties[member.name]),
          title: member.title,
          description: member.description,
        },
      ]),
    ),
  };
}

/** The reply-text sub-value prefilled from a stored catalogue: its set members only. */
export function replyTextsValue(
  stored: NonNullable<ConversationRouteView['reply_texts']>,
): ReplyTextsValue {
  const value: ReplyTextsValue = {};
  for (const { name } of REPLY_TEXT_MEMBERS) {
    const text = stored[name];
    if (text !== null) value[name] = text;
  }
  return value;
}

/**
 * The reply-text catalogue body: each member the operator filled in, or `null` when none is
 * (the contract refuses an empty catalogue, and no catalogue sends every built-in reply).
 */
export function replyTextsBody(value: ReplyTextsValue): ConversationRouteCreate['reply_texts'] {
  const body: NonNullable<ConversationRouteCreate['reply_texts']> = {};
  for (const { name } of REPLY_TEXT_MEMBERS) {
    const text = value[name];
    if (text !== undefined && text.trim() !== '') body[name] = text;
  }
  return Object.keys(body).length > 0 ? body : null;
}
