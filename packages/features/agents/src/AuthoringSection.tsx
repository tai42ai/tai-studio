/**
 * The authoring surface, GATED on an authorable agent existing: a Compose action
 * over the authored-agents list, or a dedicated empty-state when no authorable agent
 * is installed.
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { ApiError } from '@tai42/api-client';
import {
  AppLink,
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
import { AuthoredAgentsList } from './AuthoredAgentsList';
import { ComposeAgentDialog } from './ComposeAgentDialog';

/** The write route the compose flow POSTs to (`api.createPreset`); the Compose
 * control gates on the projection reaching it with POST (projection ⊆ gate).
 * Versioning/rollback for a preset live on the presets page, not here. */
const PRESETS_WRITE_ROUTE = '/api/presets';

/** Push a following flex item to the far edge of its `.tai-row`. */
const spacerStyle = { marginLeft: 'auto' };

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

  /** A presets read a scoped caller is simply not allowed to make. Narrow by
   *  CLASS, never by "it failed": a 500 or a network drop must not read as
   *  "this caller has no preset scope". */
  const presetsForbidden =
    presetsQuery.error instanceof ApiError && presetsQuery.error.status === 403;

  if (specRunnableQuery.isPending) {
    return (
      <section className="tai-stack" aria-labelledby="authoring-heading">
        <h2 id="authoring-heading" className="tai-section-title">
          Authored agents
        </h2>
        <Skeleton height={80} />
      </section>
    );
  }

  if (specRunnableQuery.isError) {
    return (
      <section className="tai-stack" aria-labelledby="authoring-heading">
        <h2 id="authoring-heading" className="tai-section-title">
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
      <section className="tai-stack" aria-labelledby="authoring-heading">
        <h2 id="authoring-heading" className="tai-section-title">
          Authored agents
        </h2>
        <Card>
          <EmptyState
            title="No authorable agent installed"
            description="Install a generic tools-agent plugin from the marketplace to compose, version, and run authored agents here."
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
        </Card>
      </section>
    );
  }

  return (
    <section className="tai-stack" aria-labelledby="authoring-heading">
      <div className="tai-row">
        <h2 id="authoring-heading" className="tai-section-title">
          Authored agents
        </h2>
        <div style={spacerStyle} />
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
        <>
          {/* Only the SCOPED-CALLER 403 degrades to absence: a caller reaching
              `/api/agents` but not `/api/presets` sees the list's own empty state
              rather than a 403 wall on a reachable surface. Every other failure —
              a 500, a network drop, a schema mismatch — is a real failure and says
              so beside the list, which stays usable. The authorable-agents read
              (specRunnable) stays the wall-worthy failure. */}
          {presetsQuery.isError && !presetsForbidden ? (
            <ErrorState
              message={errorMessage(presetsQuery.error)}
              onRetry={() => void presetsQuery.refetch()}
            />
          ) : null}
          <AuthoredAgentsList
            agents={agentsQuery.data.items}
            presets={presetsQuery.data ?? []}
            onRunAuthored={onRunAuthored}
          />
        </>
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
