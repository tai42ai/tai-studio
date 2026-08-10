# @tai42/feature-presets

The presets surface for the Studio: a master/detail page over the skeleton's
store-backed tool presets. Create a preset (base-tool pick, JSON fixed kwargs,
extensions), then view its baked kwargs, version history and rollback,
save-version, and delete from the detail pane. Depends only on
`@tai42/studio-sdk`, `@tai42/api-client`, and TanStack Query.

## Usage

```tsx
import { PresetsPage } from '@tai42/feature-presets';

<PresetsPage search={{}} />;
```

## License

Apache-2.0. See the repository `LICENSE`.
