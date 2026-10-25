# @tai42/feature-manifest

The manifest surface for the Studio: inspect the preserved manifest, edit its MCP
server configuration and read each server's live status, inspect the loaded
extensions and the manifest's extension settings, and edit manifest sections; and
list the derived sub-MCP servers on the Served endpoints page. Connecting a server
or an outside app and picking which of its tools mount happen on the Connectors
screen (`@tai42/feature-connectors`). Depends only on `@tai42/studio-sdk`,
`@tai42/api-client`, and TanStack Query.

## Usage

```tsx
import { ManifestPage } from '@tai42/feature-manifest';

<ManifestPage search={{}} />;
```

## License

Apache-2.0. See the repository `LICENSE`.
