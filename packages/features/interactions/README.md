# @tai42/feature-interactions

The human-in-the-loop interactions inbox for the Studio: answer text, confirm,
select, form, and external-link steps raised by the skeleton, plus a global
floating badge showing the pending count. Depends only on `@tai42/studio-sdk`,
`@tai42/api-client`, and TanStack Query.

## Usage

```tsx
import { InteractionsPage, InteractionsBadge } from '@tai42/feature-interactions';

<InteractionsPage search={{}} />;
<InteractionsBadge />;
```

## License

Apache-2.0. See the repository `LICENSE`.
