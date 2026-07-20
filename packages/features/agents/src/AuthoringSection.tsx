/**
 * The authoring surface, GATED on an authorable agent existing: a Compose action
 * over the authored-agents list, or a dedicated empty-state when no authorable agent
 * is installed.
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  errorMessage,
  useApi,
  useCanWrite,
} from '@tai42/studio-sdk';

import { agentsListKey, authoredPresetsKey, specRunnableAgentsKey } from './keys';
import type { AuthoredRunTarget } from './authoring-types';
import { rowStyle, stackStyle } from './authoring-styles';
import { AuthoredAgentsList } from './AuthoredAgentsList';
import { ComposeAgentDialog } from './ComposeAgentDialog';

/** The write route the compose flow POSTs to (`api.createPreset`); the Compose
 * control gates on the projection reaching it with POST (projection ⊆ gate).
 * Versioning/rollback for a preset live on the presets page, not here. */
const PRESETS_WRITE_ROUTE = '/api/presets';

/**
 * The authoring surface, GATED on an authorable agent existing. With none, it
 * renders a dedicated empty-state (never an error, never a hardcoded agent name).
 * The plain registered-agents run list below is unaffected either way.
 */
export function AuthoringSection({
  onRunAuthored,
}: {
  readonly onRunAuthored: (target: AuthoredRunTarget) => void;
}): ReactNode {
  const api = useApi();
  const [composing, setComposing] = useState(false);

  // Projection ⊆ gate: the compose action POSTs `/api/presets`, so a read-scoped
  // caller whose projection admits only GET on that route must see the section
  // read-only (no Compose button, no dialog) rather than an action that 403s — the
  // gate is method-aware, not path-only. It fails closed while the projection is not yet
  // ready (no write control before the gate is known); a full projection shows it.
  const canAuthor = useCanWrite(PRESETS_WRITE_ROUTE, 'POST');

  const specRunnableQuery = useQuery({
    queryKey: specRunnableAgentsKey,
    queryFn: () => api.listSpecRunnableAgents(),
  });
  const agentsQuery = useQuery({ queryKey: agentsListKey, queryFn: () => api.listAgents() });
  const presetsQuery = useQuery({
    queryKey: authoredPresetsKey,
    queryFn: () => api.listPresets(),
  });

  const headingStyle = {
    margin: 0,
    fontSize: 'var(--tai-text-lg)',
    color: 'var(--tai-color-text)',
  };

  if (specRunnableQuery.isPending) {
    return (
      <section style={stackStyle} aria-labelledby="authoring-heading">
        <h2 id="authoring-heading" style={headingStyle}>
          Authored agents
        </h2>
        <Skeleton height={80} />
      </section>
    );
  }

  if (specRunnableQuery.isError) {
    return (
      <section style={stackStyle} aria-labelledby="authoring-heading">
        <h2 id="authoring-heading" style={headingStyle}>
          Authored agents
        </h2>
        <ErrorState
          message={errorMessage(specRunnableQuery.error)}
          onRetry={() => void specRunnableQuery.refetch()}
        />
      </section>
    );
  }

  const authorable = specRunnableQuery.data.items;

  // Capability gate: no authorable agent installed → a dedicated empty-state.
  if (authorable.length === 0) {
    return (
      <section style={stackStyle} aria-labelledby="authoring-heading">
        <h2 id="authoring-heading" style={headingStyle}>
          Authored agents
        </h2>
        <Card>
          <EmptyState
            title="No authorable agent installed"
            description="Add a generic tools-agent plugin to compose, version, and run authored agents here."
          />
        </Card>
      </section>
    );
  }

  return (
    <section style={stackStyle} aria-labelledby="authoring-heading">
      <div style={rowStyle}>
        <h2 id="authoring-heading" style={headingStyle}>
          Authored agents
        </h2>
        <div style={{ marginLeft: 'auto' }} />
        {canAuthor ? (
          <Button
            variant="primary"
            onClick={() => {
              setComposing(true);
            }}
          >
            Compose agent
          </Button>
        ) : null}
      </div>

      {presetsQuery.isPending || agentsQuery.isPending ? (
        <Skeleton height={80} />
      ) : agentsQuery.isError ? (
        <ErrorState
          message={errorMessage(agentsQuery.error)}
          onRetry={() => void agentsQuery.refetch()}
        />
      ) : (
        <AuthoredAgentsList
          agents={agentsQuery.data.items}
          // The presets read enriches the registered agents into authored rows; it is
          // NOT load-bearing, so a scoped caller reaching `/api/agents` but not
          // `/api/presets` degrades it to ABSENCE (an empty preset list → the list's
          // own empty state) rather than 403-walling this reachable surface. The
          // authorable-agents read (specRunnable) stays the wall-worthy failure.
          presets={presetsQuery.data ?? []}
          onRunAuthored={onRunAuthored}
        />
      )}

      {composing && canAuthor ? (
        <ComposeAgentDialog
          agents={authorable}
          onClose={() => {
            setComposing(false);
          }}
        />
      ) : null}
    </section>
  );
}
