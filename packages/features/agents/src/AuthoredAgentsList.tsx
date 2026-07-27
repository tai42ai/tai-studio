/**
 * The authored agents list: DEFAULT-list presets whose `base_tool` is an agent's run
 * tool, with a Run action and a Manage link out to the presets page.
 */
import { useMemo, type ReactNode } from 'react';

import type { AgentSummary, PresetRecord } from '@tai42/api-client';
import {
  AppLink,
  Button,
  Card,
  EmptyState,
  ScrollRegion,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@tai42/studio-sdk';

import type { AuthoredRunTarget } from './authoring-types';
import { monoStyle, rowStyle } from './authoring-styles';

/**
 * The authored agents: DEFAULT-list presets whose `base_tool` is an agent's run
 * tool (matched against the live `GET /api/agents` registration names, never
 * hardcoded). Columns: name, description, base agent, active version, actions
 * (Run + a Manage link to the presets page, where versioning, rollback, and
 * delete for this preset live — never duplicated here).
 */
export function AuthoredAgentsList({
  agents,
  presets,
  onRunAuthored,
}: {
  readonly agents: readonly AgentSummary[];
  readonly presets: readonly PresetRecord[];
  readonly onRunAuthored: (target: AuthoredRunTarget) => void;
}): ReactNode {
  // Map an agent's REGISTRATION name back to the agent — an authored preset's
  // base_tool is the agent's run tool, which the backend registers under the
  // registration name (which can differ from `tool_name`).
  const agentByName = useMemo(() => {
    const map = new Map<string, AgentSummary>();
    for (const agent of agents) map.set(agent.name, agent);
    return map;
  }, [agents]);

  const authored = useMemo(
    () =>
      presets
        .map((preset) => ({ preset, baseAgent: agentByName.get(preset.base_tool) }))
        .filter(
          (row): row is { preset: PresetRecord; baseAgent: AgentSummary } =>
            row.baseAgent !== undefined,
        ),
    [presets, agentByName],
  );

  if (authored.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No authored agents yet"
          description="Compose an agent to bake a prompt, tools, and presets over a base agent."
        />
      </Card>
    );
  }

  return (
    <Card>
      <ScrollRegion label="Authored agents">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Description</TH>
              <TH>Base agent</TH>
              <TH>Active version</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {authored.map(({ preset, baseAgent }) => (
              <TR key={preset.name} data-testid="authored-agent-row" data-agent={preset.name}>
                <TD style={monoStyle}>{preset.name}</TD>
                <TD>{preset.description}</TD>
                <TD style={monoStyle}>{baseAgent.name}</TD>
                <TD>{preset.active_version}</TD>
                <TD>
                  <div style={{ ...rowStyle, flexWrap: 'wrap' }}>
                    <Button
                      variant="primary"
                      aria-label={`Run authored agent ${preset.name}`}
                      onClick={() => {
                        onRunAuthored({ name: preset.name, baseAgent });
                      }}
                    >
                      Run
                    </Button>
                    {/* Versioning, rollback, and delete for this preset live on the
                        presets page — this links out rather than duplicating them. */}
                    <AppLink
                      to="presets"
                      search={{ preset: preset.name }}
                      aria-label={`Manage authored agent ${preset.name}`}
                    >
                      Manage
                    </AppLink>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
    </Card>
  );
}
