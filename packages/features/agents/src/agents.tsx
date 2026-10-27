/**
 * The agents surface: the agent-authoring surface (Compose, gated on an authorable
 * agent existing) stacked atop ONE folder explorer of the registered agents and the
 * authored agents, and, on running one, a run view that renders the agent's input
 * auto-form and streams its run as a live timeline.
 *
 * NAVIGATION: list ⇄ run (both plain and authored) is local component state (no
 * route change), so the feature owns a single shell route. The run view links out
 * to the agent's run TOOL on the tools page, and an interrupt links to the
 * interactions inbox.
 *
 * The streaming engine and the shared run view live in `./run-view`; the authoring
 * surface lives in `./authoring`; the explorer in `./AgentExplorer`. This module
 * composes them into the page.
 */
import type { AgentSummary } from '@tai42/api-client';
import { PageHeader, Stack } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { AgentExplorer } from './AgentExplorer';
import { type AuthoredRunTarget, AuthoredRunView, AuthoringSection } from './authoring';
import { StreamRunView, useAgentRun } from './run-view';
import { useAgentCatalog } from './useAgentCatalog';

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

// -- list --------------------------------------------------------------------

/**
 * The list mode: the authoring surface atop the one agents explorer, both drawn from
 * one `useAgentCatalog` read, so the authoring surface's word on the authored agents
 * and the explorer's rows always agree.
 */
function AgentsList({
  onRun,
  onRunAuthored,
}: {
  readonly onRun: (agent: AgentSummary) => void;
  readonly onRunAuthored: (target: AuthoredRunTarget) => void;
}): ReactNode {
  const catalog = useAgentCatalog();
  return (
    <>
      <AuthoringSection authored={catalog.authored} />
      <AgentExplorer catalog={catalog} onRun={onRun} onRunAuthored={onRunAuthored} />
    </>
  );
}

// -- page --------------------------------------------------------------------

/**
 * The agents page. Shell-mounted; it takes no route search params (list ⇄ run is
 * local state), so it is a plain page component. It stacks the AUTHORING surface
 * (Compose, gated on an authorable agent existing) atop the one agents explorer of
 * registered and authored agents.
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
      <AgentsList onRun={setSelected} onRunAuthored={setAuthoredRun} />
    </Stack>
  );
}
