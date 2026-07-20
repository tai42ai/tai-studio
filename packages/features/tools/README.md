# @tai42/feature-tools

The flagship tools surface for the Studio: a master list of the skeleton's
registered tools plus a per-tool run panel that either delegates to a
plugin-contributed panel or drives a schema-driven auto-form, runs the tool
synchronously or in the background, and renders a typed result (JSON tree,
escaped text, or inline image/audio for media results). Depends only on
`@tai42/studio-sdk`, `@tai42/api-client`, and TanStack Query.

## Usage

```tsx
import { ToolsPage } from '@tai42/feature-tools';

<ToolsPage search={{}} />;
```

## License

Apache-2.0. See the repository `LICENSE`.
