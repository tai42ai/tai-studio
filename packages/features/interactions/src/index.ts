/**
 * @tai42/feature-interactions — the human-in-the-loop interactions inbox.
 *
 * `InteractionsPage` is the shell-mounted page and `InteractionsBadge` is the
 * global floating count badge. The card wrapper and per-format answer renderers
 * are exported for direct unit testing.
 */
export { InteractionsPage } from './interactions';
export { InteractionsBadge } from './InteractionsBadge';
export { ChannelsCard } from './ChannelsCard';
export {
  InteractionCard,
  TextAnswer,
  ConfirmAnswer,
  SelectAnswer,
  FormAnswer,
  ExternalLinkCard,
} from './renderers';
export type { AnswerRendererProps } from './renderers';
