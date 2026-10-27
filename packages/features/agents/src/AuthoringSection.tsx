/**
 * The authoring surface, GATED on an authorable agent existing: the Compose action
 * (and its dialog) and what the screen knows of the authored agents as a group — a
 * loading placeholder while their reads load, and "No authored agents yet" when none
 * exist — or a dedicated empty-state when no authorable agent is installed. The
 * authored agents themselves are listed, filed and run in the one agents explorer
 * below it, each marked with its kind; managing them (versioning, rollback, delete)
 * lives on the presets page.
 */
import { apiRoutes } from '@tai42/api-client';
import {
  AppLink,
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  Skeleton,
  useApi,
  useCanWrite,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { ComposeAgentDialog } from './ComposeAgentDialog';
import { specRunnableAgentsKey } from './keys';
import type { AuthoredAgentsState } from './useAgentCatalog';

/** The write route the compose flow POSTs to (`api.createPreset`); the Compose
 * control gates on the projection reaching it with POST (projection ⊆ gate). */
const PRESETS_WRITE_ROUTE = apiRoutes.post_api_presets.path;

/**
 * The authoring surface. With no authorable agent it renders a dedicated empty-state
 * (never an error, never a hardcoded agent name); the agents explorer below is
 * unaffected either way. A failed authored-agents read says nothing here: the
 * explorer says it loudly.
 */
export function AuthoringSection({
  authored,
}: {
  readonly authored: AuthoredAgentsState;
}): ReactNode {
  const api = useApi();
  const [composing, setComposing] = useState(false);

  // Projection ⊆ gate: the compose action POSTs `/api/presets`, so a read-scoped
  // caller whose projection admits only GET on that route must see no Compose
  // button and no dialog rather than an action that 403s — the gate is
  // method-aware, not path-only. It fails closed while the projection is not yet
  // ready (no write control before the gate is known); a full projection shows it.
  const canAuthor = useCanWrite(PRESETS_WRITE_ROUTE, 'POST');

  const specRunnableQuery = useQuery({
    queryKey: specRunnableAgentsKey,
    queryFn: () => api.listSpecRunnableAgents(),
  });

  if (specRunnableQuery.isPending) {
    return (
      <section aria-label="Agent authoring">
        <Skeleton height={40} />
      </section>
    );
  }

  if (specRunnableQuery.isError) {
    return (
      <section aria-label="Agent authoring">
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
      <section aria-label="Agent authoring">
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

  const noneYet = authored.status === 'loaded' && authored.count === 0;
  if (!canAuthor && !noneYet && authored.status !== 'loading') return null;

  return (
    <section aria-label="Agent authoring" className="tai-stack">
      {canAuthor ? (
        <div className="tai-row">
          <Button
            variant="primary"
            onClick={() => {
              setComposing(true);
            }}
          >
            Compose agent
          </Button>
        </div>
      ) : null}
      {authored.status === 'loading' ? (
        <div data-testid="authored-agents-loading">
          <Skeleton height={80} />
        </div>
      ) : null}
      {noneYet ? (
        <Card>
          <EmptyState
            title="No authored agents yet"
            // The hint names Compose only for a caller who has it.
            description={
              canAuthor
                ? 'Compose an agent to bake a prompt, tools, and presets over a base agent.'
                : undefined
            }
          />
        </Card>
      ) : null}
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
