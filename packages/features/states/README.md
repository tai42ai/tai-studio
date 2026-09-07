# @tai42/feature-states

The States surface for the Studio: a master/detail page over the platform's
subject-keyed state store. Declare a state (base JSON schema, subject kinds,
retention), mount reusable module documents, look up and edit a subject's record,
fold subjects together, and read a record's write audit trail. A Consumers tab
lists everything that binds a state (flows, hooks, schedules, agents). Depends only
on `@tai42/studio-sdk`, `@tai42/api-client`, and TanStack Query.

## Usage

```tsx
import { StatesPage } from '@tai42/feature-states';

<StatesPage search={{}} />;
```

## License

Apache-2.0. See the repository `LICENSE`.
