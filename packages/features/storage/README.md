# @tai42/feature-storage

The storage surface for the Studio: the content store a storage-provider plugin
exposes — browse and filter resources, inspect a resource's stat fields, download,
upload, and delete. With no provider configured the page renders an empty state
and nothing else. Depends only on `@tai42/studio-sdk`, `@tai42/api-client`, and
TanStack Query.

## Usage

```tsx
import { StoragePage } from '@tai42/feature-storage';

<StoragePage search={{}} />;
```

## Tests

```bash
pnpm --filter @tai42/feature-storage test
```

## License

Apache-2.0. See the repository `LICENSE`.
