/**
 * The two orthogonal status vocabularies a conversation record carries, mapped to
 * their chip paint and label. `delivery_status` is where the answer sits in the
 * send machine; `answer_status` is the nature of the turn's outcome.
 *
 * A failure never reads as an ordinary row: `failed` takes the danger tint, and
 * every chip pairs its tint with a WORD, so colour is never the only carrier.
 */
import type { ConversationAnswerStatus, ConversationDeliveryStatus } from '@tai42/api-client';

/** The delivery statuses in send-machine order — the status filter's option order. */
export const DELIVERY_STATUSES: readonly ConversationDeliveryStatus[] = [
  'accepted',
  'pending_delivery',
  'provisional',
  'delivered',
  'failed',
  'shed',
  'silent',
];

export const DELIVERY_VARIANT: Record<ConversationDeliveryStatus, string> = {
  accepted: 'neutral',
  pending_delivery: 'neutral',
  provisional: 'warning',
  delivered: 'success',
  failed: 'danger',
  shed: 'warning',
  silent: 'neutral',
};

export const DELIVERY_LABEL: Record<ConversationDeliveryStatus, string> = {
  accepted: 'Accepted',
  pending_delivery: 'Pending delivery',
  provisional: 'Provisional',
  delivered: 'Delivered',
  failed: 'Failed',
  shed: 'Shed',
  silent: 'Silent',
};

export const ANSWER_VARIANT: Record<ConversationAnswerStatus, string> = {
  answered: 'success',
  error: 'danger',
  silent: 'neutral',
};

export const ANSWER_LABEL: Record<ConversationAnswerStatus, string> = {
  answered: 'Answered',
  error: 'Error',
  silent: 'Silent',
};

/** The statuses an operator is meant to NOTICE — surfaced loudly wherever they appear. */
export function isLoudDelivery(status: ConversationDeliveryStatus): boolean {
  return status === 'failed';
}
