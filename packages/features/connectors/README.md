# @tai42/feature-connectors

The connectors surface for the Studio: one searchable directory of the outside
apps (connector providers), the configured MCP servers and the marketplace
listings not installed yet, each opening one connect flow (Connect, then Pick
tools, then Done) that runs the OAuth popup sign-in, installs a listing, or fixes
a server, and then picks which of its tools mount; plus the list of connections
and each connection's detail. The MCP server configuration editor is on the
Manifest screen (`@tai42/feature-manifest`). Depends only on `@tai42/studio-sdk`,
`@tai42/api-client`, and TanStack Query.

## Usage

```tsx
import { ConnectorsPage } from '@tai42/feature-connectors';

<ConnectorsPage search={{}} />;
```

## License

Apache-2.0. See the repository `LICENSE`.
