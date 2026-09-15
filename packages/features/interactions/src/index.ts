/**
 * @tai42/feature-interactions — the human-in-the-loop interactions inbox.
 *
 * `InteractionsPage` is the shell-mounted page and `InteractionsBadge` is the
 * global floating count badge. The card wrapper and per-format answer renderers
 * are exported for direct unit testing.
 */
export { ChannelsCard } from './ChannelsCard';
export { InteractionsPage } from './interactions';
export { InteractionsBadge } from './InteractionsBadge';
export type { AnswerRendererProps } from './renderers';
export {
  ConfirmAnswer,
  ExternalLinkCard,
  FormAnswer,
  InteractionCard,
  SelectAnswer,
  TextAnswer,
} from './renderers';
