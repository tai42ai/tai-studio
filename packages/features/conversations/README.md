# @tai42/feature-conversations

The cross-channel conversation monitor for the Studio: pick a conversation route,
read its threads (address, last activity, message count, delivery status), and
open one thread's transcript as a live-tailing exchange view. Read-only — nothing
here writes. Depends only on `@tai42/studio-sdk`, `@tai42/api-client`, and
TanStack Query.

## Usage

```tsx
import { ConversationsPage } from '@tai42/feature-conversations';

<ConversationsPage search={{ route: 'support', thread: 'bridge:support:+15551234567' }} />;
```

## License

Apache-2.0. See the repository `LICENSE`.
