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

## Generated from the platform

The response schemas, the route table and the platform constants are generated from
the two artifacts the platform publishes, vendored under `contract-schema/`: the
contract's JSON-schema bundle (`contract-schema.json`) and the skeleton's OpenAPI
artifact (`openapi.json`). `scripts/gen-schemas.mjs` writes `src/generated/`:

- `served-schemas.ts` — one zod schema per served contract document and shared
  sub-shape, plus `servedConstants`, `servedVectors` and `servedDocumentsJson`;
- `openapi-schemas.ts` — one zod schema per OpenAPI component (a component that is a
  contract document re-exports it) and `responseSchemas`, the schema of each
  operation's `{"data": …}` body;
- `api-routes.ts` — `apiRoutes` (each operation's method and path template),
  `apiPathPrefixes` and `buildPath`, which encodes each path parameter.

`schema:refresh` re-vendors both artifacts from a platform checkout (`TAI42_REPO`) by
hand; `schema:check` runs in the gate and fails on a stale generated file. Two CI jobs
pin the vendored majors: `api-client-contract-pin` checks the bundle's
`contract_version` against the latest `tai42-contract` and the OpenAPI artifact's
`info.version` against the latest `tai42-skeleton`; `docs-demo-contract-pin` checks the
docs-demo fixture's `contract` range.

The `src/schemas/*.ts` modules export the generated schemas under the client's names.
What stays hand-written says why in the file: a shape the spec carries as an open or
opaque value (a tool's own result, the upstream marketplace registry's bodies, a
version body, a fan-out's modes), a client-side narrowing (the minted key, the
`format_payload` normalization), the SSE frames, and a plugin's routes, which the core
spec does not publish.

## License

Apache-2.0. See the repository `LICENSE`.
