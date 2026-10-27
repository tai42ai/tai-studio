# @tai42/feature-marketplace

The marketplace surface for the Studio: browse the curated plugin registry at the
item level, inspect a plugin's detail (versions, contained items, advisories), and
install, update, or uninstall plugins through the skeleton's marketplace routes.
Both the Browse results and the Installed list switch between a table and a card
grid with the shared list/card control; each tab remembers its own choice.
Depends only on `@tai42/studio-sdk`, `@tai42/api-client`, and TanStack Query.

## Usage

```tsx
import { MarketplacePage } from '@tai42/feature-marketplace';

<MarketplacePage search={{}} />;
```

## Tests

```bash
pnpm --filter @tai42/feature-marketplace test
```

## License

Apache-2.0. See the repository `LICENSE`.
