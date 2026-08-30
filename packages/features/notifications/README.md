# @tai42/feature-notifications

The notifications surface for the Studio: the internal `notify_user` sink inbox,
listing the messages recorded with no delivery channel, newest-first. Each record
renders its FULL stored shape — the message, any display media (images inline and
safe links), any tappable `options` the send offered, any pre-approved `template`,
and the recipient / audience / timestamp metadata — through the same gated,
loud-on-failure media renderer idiom the interactions inbox uses (with `data:image/*`
additionally admitted, since the sink stores media raw). The feed arrives whole (a
bounded server-side ring buffer, no cursor door), so the inbox reveals it a page at a
time with an in-place "Show more" control. Depends only on `@tai42/studio-sdk`,
`@tai42/api-client`, and TanStack Query.

## Usage

```tsx
import { NotificationsPage } from '@tai42/feature-notifications';

<NotificationsPage search={{}} />;
```

## License

Apache-2.0. See the repository `LICENSE`.
