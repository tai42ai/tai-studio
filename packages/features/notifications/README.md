# @tai42/feature-notifications

The notifications surface for the Studio: the internal `notify_user` sink inbox,
listing the messages recorded with no delivery channel, newest-first. Depends
only on `@tai42/studio-sdk`, `@tai42/api-client`, and TanStack Query.

## Usage

```tsx
import { NotificationsPage } from '@tai42/feature-notifications';

<NotificationsPage search={{}} />;
```

## License

Apache-2.0. See the repository `LICENSE`.
