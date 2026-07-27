/**
 * The authored streaming run: reuses the shared `StreamRunView` pointed at the
 * authored-run endpoint, with the run form showing only the NON-baked `ToolInput`
 * fields (the baked spec keys are resolved server-side).
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  ArrowLeftIcon,
  Button,
  ErrorState,
  Skeleton,
  errorMessage,
  useApi,
  useCanWrite,
  type JsonSchema,
} from '@tai42/studio-sdk';

import { StreamRunView, useAuthoredAgentRun } from './run-view';
import { authoredPresetKey } from './keys';
import type { AuthoredRunTarget } from './authoring-types';
import { ALL_SPEC_FIELDS, schemaProps } from './authoring-schema';
import { stackStyle } from './authoring-styles';

/**
 * The run input schema: the base agent's `ToolInput` with BOTH the baked (fixed)
 * spec keys AND the whole composable spec field set removed — a run supplies only
 * the query/user input, never the agent's fixed identity (naming a baked field is
 * a loud server 400 anyway). Composable spec fields are agent configuration, not
 * run-time input, so they are never rendered as a run control.
 */
function reduceSchema(schema: JsonSchema, bakedKeys: ReadonlySet<string>): JsonSchema {
  const props = schemaProps(schema);
  const remaining: Record<string, JsonSchema> = {};
  for (const [key, node] of Object.entries(props)) {
    if (!bakedKeys.has(key) && !ALL_SPEC_FIELDS.includes(key)) remaining[key] = node;
  }
  const required = (schema.required ?? []).filter(
    (key) => !bakedKeys.has(key) && !ALL_SPEC_FIELDS.includes(key),
  );
  return { ...schema, properties: remaining, required };
}

/**
 * Stream an authored agent's run, REUSING the shared `StreamRunView` (the SSE run
 * panel) pointed at the authored-run endpoint. The input form shows
 * only the NON-baked `ToolInput` fields (the baked spec keys are resolved
 * server-side; naming one is a loud server 400), so the schema is the base agent's
 * `input_schema` with the baked keys removed.
 */
export function AuthoredRunView({
  target,
  onBack,
}: {
  readonly target: AuthoredRunTarget;
  readonly onBack: () => void;
}): ReactNode {
  const api = useApi();
  const run = useAuthoredAgentRun(target.name);
  // Projection ⊆ gate: the authored run POSTs the dynamic per-agent authored-run route,
  // which the plain-agent `projection.agents` list cannot vouch for, so gate it directly.
  // A dynamic route is not method-expressible, so this resolves to a full-projection gate.
  const canRun = useCanWrite(`/api/agents/authored/${target.name}/runs`, 'POST');
  const detailQuery = useQuery({
    queryKey: authoredPresetKey(target.name),
    queryFn: ({ signal }) => api.getPreset(target.name, signal),
  });

  if (detailQuery.isPending) {
    return (
      <section style={stackStyle}>
        <Skeleton height={40} />
        <Skeleton height={120} />
      </section>
    );
  }
  if (detailQuery.isError) {
    return (
      <section style={stackStyle}>
        <Button type="button" variant="secondary" onClick={onBack} aria-label="Back to agents">
          <ArrowLeftIcon />
          Back
        </Button>
        <ErrorState
          message={errorMessage(detailQuery.error)}
          onRetry={() => void detailQuery.refetch()}
        />
      </section>
    );
  }

  const fixedKwargs = detailQuery.data.fixed_kwargs;
  const bakedKeys = new Set(Object.keys(fixedKwargs));
  const schema = reduceSchema(target.baseAgent.input_schema, bakedKeys);
  // The baked (fixed) fields, shown read-only above the run form so the operator
  // sees the agent's fixed identity. Authed surface only — never logged or toasted.
  const bakedFields = Object.entries(fixedKwargs).map(([key, value]) => ({ key, value }));

  return (
    <StreamRunView
      title={target.name}
      schema={schema}
      run={run}
      onBack={onBack}
      backLabel="Back to agents"
      bakedFields={bakedFields}
      canRun={canRun}
    />
  );
}
