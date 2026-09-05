# @tai42/api-client

The typed client for the `tai42-skeleton` HTTP API. It exposes one call per
consumed endpoint and validates every response against a zod schema, so a
response that drifts from the expected shape throws instead of flowing bad data
into the UI. It holds no server state of its own — caching lives in the feature
packages via TanStack Query — and also provides the Server-Sent-Events frame
parser used for streaming agent runs.

## Install

```bash
pnpm add @tai42/api-client
```

## Usage

```ts
import { createApiClient } from '@tai42/api-client';

const api = createApiClient({ baseUrl: '', getToken: () => 'sk-...' });
const tools = await api.listTools();
const result = await api.runTool({ tool: 'generate_uuid' });
```

The client type grows with the API it wraps — additions to it (such as
`cancelInteraction`) are major releases, since mocks and implementations of the
client type must add every member.
```ts
await api.cancelInteraction('int_123'); // withdraw a pending ask unanswered
```

## License

Apache-2.0. See the repository `LICENSE`.
