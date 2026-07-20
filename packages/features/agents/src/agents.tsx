/**
 * The agents surface: the agent-authoring surface (compose / version / roll back /
 * run authored agents, gated on an authorable agent existing) stacked atop a list
 * of registered agents and, on selecting one, a run view that renders the agent's
 * input auto-form and streams its run as a live timeline.
 *
 * NAVIGATION: list ⇄ run (both plain and authored) is local component state (no
 * route change), so the feature owns a single shell route. The run view links out
 * to the agent's run TOOL on the tools page, and an interrupt links to the
 * interactions inbox.
 *
 * The streaming engine and the shared run view live in `./run-view`; the authoring
 * surface lives in `./authoring`. This module composes them into the page.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import type { AgentSummary } from '@tai42/api-client';
import {
  AppLink,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  isFullProjection,
  useApi,
  useCapabilities,
  type CapabilityState,
} from '@tai42/studio-sdk';

import { AuthoringSection, AuthoredRunView, type AuthoredRunTarget } from './authoring';
import { agentsListKey } from './keys';
import { StreamRunView, useAgentRun } from './run-view';

// -- styles ------------------------------------------------------------------

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};
const headingStyle: CSSProperties = {
  margin: 0,
  font: 'var(--tai-text-xl, var(--tai-text-lg)) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
};
const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};
const cardBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
};
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-3)',
};
const mutedStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};
const nameStyle: CSSProperties = {
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
};
const spacerStyle: CSSProperties = { marginLeft: 'auto' };

// -- list --------------------------------------------------------------------

/**
 * The registered agents visible to the caller. A scoped session sees only the
 * agents its projection lists; a full session — and any not-yet-ready projection
 * — sees the whole registry, with the server the final authority on every run.
 */
function projectedAgents(
  items: readonly AgentSummary[],
  state: CapabilityState,
): readonly AgentSummary[] {
  if (state.status !== 'ready' || isFullProjection(state.projection)) return items;
  const allowed = new Set(state.projection.agents);
  return items.filter((agent) => allowed.has(agent.name));
}

function AgentsList({ onRun }: { readonly onRun: (agent: AgentSummary) => void }): ReactNode {
  const api = useApi();
  const { state } = useCapabilities();
  const query = useQuery({ queryKey: agentsListKey, queryFn: () => api.listAgents() });

  if (query.isPending) {
    return (
      <div style={listStyle} data-testid="agents-loading">
        {[0, 1, 2].map((row) => (
          <Card key={row}>
            <Skeleton width="40%" height={18} />
          </Card>
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Failed to load agents'}
      />
    );
  }
  const items = projectedAgents(query.data.items, state);
  if (items.length === 0) {
    return (
      <EmptyState
        title="No agents registered"
        description="Agents declared in the manifest appear here, ready to run."
      />
    );
  }

  return (
    <div style={listStyle}>
      {items.map((agent) => (
        <Card key={agent.name}>
          <div style={cardBodyStyle} data-testid="agent-row" data-agent={agent.name}>
            <div style={rowStyle}>
              <span style={nameStyle}>{agent.name}</span>
              <div style={spacerStyle} />
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  onRun(agent);
                }}
              >
                Run
              </Button>
            </div>
            {agent.description ? <span style={mutedStyle}>{agent.description}</span> : null}
            <AppLink
              to="tools"
              // The run tool is registered under the agent's REGISTRATION name (which
              // can differ from tool_name), so the tools page is keyed on that name.
              search={{ tool: agent.name }}
              aria-label={`Open the ${agent.name} run tool`}
            >
              Open run tool
            </AppLink>
          </div>
        </Card>
      ))}
    </div>
  );
}

// -- run view ----------------------------------------------------------------

function RunView({
  agent,
  onBack,
}: {
  readonly agent: AgentSummary;
  readonly onBack: () => void;
}): ReactNode {
  const run = useAgentRun(agent.name);
  return (
    <StreamRunView
      title={agent.name}
      schema={agent.input_schema}
      run={run}
      onBack={onBack}
      backLabel="Back to agents"
    />
  );
}

// -- page --------------------------------------------------------------------

/**
 * The agents page. Shell-mounted; it takes no route search params (list ⇄ run is
 * local state), so it is a plain page component. It stacks the AUTHORING surface
 * (compose + the authored-agents list, gated on an authorable agent existing) atop
 * the plain registered-agents run list — the run UI is unaffected by authoring.
 */
export function AgentsPage(): ReactNode {
  const [selected, setSelected] = useState<AgentSummary | null>(null);
  const [authoredRun, setAuthoredRun] = useState<AuthoredRunTarget | null>(null);

  if (selected !== null) {
    return (
      <RunView
        agent={selected}
        onBack={() => {
          setSelected(null);
        }}
      />
    );
  }

  if (authoredRun !== null) {
    return (
      <AuthoredRunView
        target={authoredRun}
        onBack={() => {
          setAuthoredRun(null);
        }}
      />
    );
  }

  return (
    <section style={pageStyle} aria-labelledby="agents-heading">
      <h1 id="agents-heading" style={headingStyle}>
        Agents
      </h1>
      <AuthoringSection onRunAuthored={setAuthoredRun} />
      <AgentsList onRun={setSelected} />
    </section>
  );
}
