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
import type { ReactNode } from 'react';

import type { AgentSummary } from '@tai42/api-client';
import {
  AppLink,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  Stack,
  isFullProjection,
  useApi,
  useCapabilities,
  type CapabilityState,
} from '@tai42/studio-sdk';

import { AuthoringSection, AuthoredRunView, type AuthoredRunTarget } from './authoring';
import { agentsListKey } from './keys';
import { StreamRunView, useAgentRun } from './run-view';

/** Push a following flex item to the far edge of its `.tai-row`. */
const spacerStyle = { marginLeft: 'auto' };

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
      <div className="tai-stack" data-testid="agents-loading">
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
        description="Agents come from installed agent plugins — install one from the marketplace to run it here."
        action={
          <AppLink
            to="marketplace"
            search={{ kind: 'agent' }}
            className="tai-btn tai-btn-secondary"
          >
            Browse marketplace
          </AppLink>
        }
      />
    );
  }

  return (
    <div className="tai-stack">
      {items.map((agent) => (
        <Card key={agent.name}>
          <div className="tai-stack-2" data-testid="agent-row" data-agent={agent.name}>
            <div className="tai-row">
              <span className="tai-mono">{agent.name}</span>
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
            {agent.description ? <span className="tai-muted">{agent.description}</span> : null}
            <AppLink
              to="tools"
              // The run tool is registered under the agent's REGISTRATION name (which
              // can differ from tool_name), so the tools page is keyed on that name.
              search={{ tool: agent.name }}
              // The name BEGINS with the visible text (WCAG 2.5.3, Label in Name):
              // "Open the … run tool" left a voice-control user naming a control that
              // reads "Open run tool".
              aria-label={`Open run tool for ${agent.name}`}
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
    <Stack gap={6}>
      <PageHeader eyebrow="Capabilities" title="Agents" />
      <AuthoringSection onRunAuthored={setAuthoredRun} />
      <AgentsList onRun={setSelected} />
    </Stack>
  );
}
