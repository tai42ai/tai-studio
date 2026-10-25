/**
 * The connect flow: one dialog, three steps (Connect → Pick tools → Done) under a
 * `Stepper`. Opened at Connect for a provider, a server that needs fixing or a
 * marketplace listing to install, or at Pick tools for a connection or a server
 * that already exists. The Pick tools step
 * is drawn only for a session that may both list a server's tools and write its
 * pick; for any other session the steps are Connect and Done.
 */
import {
  apiRoutes,
  type FleetReportSummary,
  isFleetReportFailure,
  type MarketplaceSearchRow,
  type ProviderView,
} from '@tai42/api-client';
import {
  ConfirmDialog,
  Dialog,
  mcpStatusKey,
  preservedManifestKey,
  Stepper,
  type StepperStep,
  useCanWrite,
} from '@tai42/studio-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useState } from 'react';

import { DoneStep, PickStepBody, ServerConnectStep } from './connect-flow-steps';
import { ConnectForm } from './connect-form';
import { ListingConnectStep } from './listing-connect-step';
import type { SavedPick } from './pick-tools-step';
import { connectionEntries, type DirectoryReads } from './use-directory';

/** Where the flow opens. */
export type FlowTarget =
  | { readonly kind: 'provider'; readonly provider: ProviderView }
  | { readonly kind: 'server'; readonly title: string }
  | { readonly kind: 'listing'; readonly listing: MarketplaceSearchRow }
  | {
      readonly kind: 'pick';
      readonly name: string;
      readonly titles: readonly string[];
      readonly connectionId: string | null;
    }
  | {
      readonly kind: 'resumed';
      readonly connectionId: string;
      readonly fleet: FleetReportSummary | null;
    };

type Step = 'connect' | 'pick' | 'done';

/** The connection the flow opens on: the target's own, else none until a connect. */
function targetConnectionId(target: FlowTarget): string | null {
  return target.kind === 'pick' || target.kind === 'resumed' ? target.connectionId : null;
}

/** The display name of the provider a connection belongs to, once both reads answer. */
function connectionProviderName(reads: DirectoryReads, connectionId: string | null): string {
  const connection =
    connectionId !== null && reads.connections.status === 'ready'
      ? reads.connections.data.find((c) => c.connection_id === connectionId)
      : undefined;
  if (connection === undefined || reads.providers.status !== 'ready') return '';
  return reads.providers.data.find((p) => p.id === connection.provider_id)?.display_name ?? '';
}

/** The name the flow shows and the server titles its Pick tools step covers. */
function flowSubject(
  target: FlowTarget,
  reads: DirectoryReads,
  connectionId: string | null,
  listingTitles: readonly string[],
): { name: string; titles: readonly string[] } {
  const entries = reads.manifest.status === 'ready' ? reads.manifest.data : null;
  const connectionTitles =
    connectionId === null ? [] : connectionEntries(entries, connectionId).map((e) => e.title);
  switch (target.kind) {
    case 'server':
      return { name: target.title, titles: [target.title] };
    case 'listing':
      return {
        name: target.listing.display_name ?? target.listing.name,
        titles: connectionId === null ? listingTitles : connectionTitles,
      };
    case 'pick':
      return {
        name: target.name,
        titles: target.connectionId === null ? target.titles : connectionTitles,
      };
    case 'provider':
      return { name: target.provider.display_name, titles: connectionTitles };
    case 'resumed':
      return { name: connectionProviderName(reads, connectionId), titles: connectionTitles };
  }
}

/** The stepper's steps; Pick tools is drawn only for a session that may pick. */
function flowSteps(step: Step, pickable: boolean): StepperStep[] {
  const pickStatus = step === 'pick' ? 'current' : step === 'done' ? 'done' : 'upcoming';
  return [
    { id: 'connect', label: 'Connect', status: step === 'connect' ? 'current' : 'done' },
    ...(pickable ? [{ id: 'pick', label: 'Pick tools', status: pickStatus } as const] : []),
    { id: 'done', label: 'Done', status: step === 'done' ? 'current' : 'upcoming' },
  ];
}

/** The Connect step for the target; a flow opened at Pick tools has none. */
function ConnectStepBody({
  target,
  reads,
  onConnected,
  onServersReady,
  onBound,
  onClose,
  onSetClientCredentials,
}: {
  readonly target: FlowTarget;
  readonly reads: DirectoryReads;
  readonly onConnected: (id: string, fleet: FleetReportSummary | null) => void;
  readonly onServersReady: (titles: readonly string[]) => void;
  readonly onBound: () => void;
  readonly onClose: () => void;
  readonly onSetClientCredentials: (provider: ProviderView) => void;
}): ReactNode {
  const setCredentials = (provider: ProviderView): void => {
    onClose();
    onSetClientCredentials(provider);
  };
  switch (target.kind) {
    case 'provider':
      return (
        <ConnectForm
          provider={target.provider}
          onConnected={onConnected}
          onCancel={onClose}
          onSetClientCredentials={setCredentials}
        />
      );
    case 'listing':
      return (
        <ListingConnectStep
          listing={target.listing}
          onConnected={onConnected}
          onServersReady={onServersReady}
          onSetClientCredentials={setCredentials}
          onClose={onClose}
        />
      );
    case 'server':
      return <ServerConnectStep title={target.title} reads={reads} onBound={onBound} />;
    case 'pick':
    case 'resumed':
      return null;
  }
}

export function ConnectFlowDialog({
  target,
  reads,
  onClose,
  onSetClientCredentials,
}: {
  readonly target: FlowTarget;
  readonly reads: DirectoryReads;
  readonly onClose: () => void;
  readonly onSetClientCredentials: (provider: ProviderView) => void;
}): ReactNode {
  const queryClient = useQueryClient();
  const canListTools = useCanWrite(apiRoutes.post_api_mcp_status_title_advertised_tools.path);
  const canPick = useCanWrite(apiRoutes.put_api_mcp_config_entries_title_tool_filter.path, 'PUT');
  const pickable = canListTools && canPick;

  const opensAtPick = target.kind === 'pick' || target.kind === 'resumed';
  const [step, setStep] = useState<Step>(opensAtPick ? 'pick' : 'connect');
  const [connectionId, setConnectionId] = useState<string | null>(targetConnectionId(target));
  const [addFleet, setAddFleet] = useState<FleetReportSummary | null>(
    target.kind === 'resumed' ? target.fleet : null,
  );
  const [listingTitles, setListingTitles] = useState<readonly string[]>([]);
  const [saved, setSaved] = useState<readonly SavedPick[]>([]);
  const [dirty, setDirty] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);

  const { name, titles } = flowSubject(target, reads, connectionId, listingTitles);
  const dialogTitle = target.kind === 'pick' ? `Pick tools: ${target.name}` : `Connect ${name}`;
  // Back to Connect is offered only while the flow is on a step after its own Connect.
  const canStepBack = !opensAtPick && step !== 'done' && target.kind !== 'listing';

  const advance = useCallback((): void => {
    setStep(pickable ? 'pick' : 'done');
  }, [pickable]);

  const onConnected = useCallback(
    (id: string, fleet: FleetReportSummary | null): void => {
      setConnectionId(id);
      setAddFleet(isFleetReportFailure(fleet) ? fleet : null);
      void queryClient.invalidateQueries({ queryKey: preservedManifestKey });
      void queryClient.invalidateQueries({ queryKey: mcpStatusKey });
      advance();
    },
    [advance, queryClient],
  );

  const close = (): void => {
    if (step === 'pick' && dirty) setConfirmingClose(true);
    else onClose();
  };

  const stepBody: Record<Step, () => ReactNode> = {
    connect: () => (
      <ConnectStepBody
        target={target}
        reads={reads}
        onConnected={onConnected}
        onServersReady={(ready) => {
          setListingTitles(ready);
          advance();
        }}
        onBound={advance}
        onClose={onClose}
        onSetClientCredentials={onSetClientCredentials}
      />
    ),
    pick: () => (
      <PickStepBody
        name={name}
        titles={titles}
        connectionId={connectionId}
        reads={reads}
        justAdded={
          target.kind === 'provider' || target.kind === 'resumed' || target.kind === 'listing'
        }
        addFleet={addFleet}
        onDirtyChange={setDirty}
        onLeave={onClose}
        onDone={(picks) => {
          setSaved(picks);
          setStep('done');
        }}
      />
    ),
    done: () => (
      <DoneStep
        name={name}
        titles={titles}
        reads={reads}
        saved={saved}
        connectionId={connectionId}
        onClose={onClose}
      />
    ),
  };

  return (
    <>
      <Dialog
        title={dialogTitle}
        open
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <Stepper
          aria-label="Connection steps"
          steps={flowSteps(step, pickable)}
          {...(canStepBack
            ? {
                onStepSelect: (id: string) => {
                  if (id === 'connect') setStep('connect');
                },
              }
            : {})}
        />
        {stepBody[step]()}
      </Dialog>
      {confirmingClose ? (
        <ConfirmDialog
          title="Discard unsaved changes?"
          confirmLabel="Discard changes"
          pendingLabel="Discarding"
          confirmVariant="danger"
          isPending={false}
          onConfirm={() => {
            setConfirmingClose(false);
            onClose();
          }}
          onClose={() => {
            setConfirmingClose(false);
          }}
        >
          <p style={{ margin: 0 }}>This editor has unsaved changes. Leaving now discards them.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
