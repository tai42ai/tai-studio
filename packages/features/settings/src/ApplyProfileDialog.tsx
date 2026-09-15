/**
 * The destructive profile apply flow (reused for a named profile and for `@previous`
 * revert): it reviews the diff first — the recycle/refused callouts and a warning —
 * then the fenced Apply fires. A diff carrying refused keys BLOCKS apply (a refusal
 * aborts, it is never sent). On success the dedicated apply report replaces the
 * review; on failure the review stays with a loud error.
 */
import { summarizeFleetFanout } from '@tai42/api-client';
import {
  Badge,
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  FleetReport,
  Spinner,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';

import {
  envConfigKey,
  settingsProfileKey,
  settingsProfilesKey,
  settingsProfileVersionsKey,
} from './keys';
import { assertApplyable } from './profile-apply';
import type { ApplyResponse } from './profile-secrets';
import { DiffCallouts } from './ProfileDiffDialog';

const dangerPanelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
  margin: '0 0 var(--tai-space-3)',
  padding: 'var(--tai-space-3)',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-err-text)',
  background: 'var(--tai-color-danger-surface)',
  color: 'var(--tai-color-err-text)',
  fontSize: 'var(--tai-text-sm)',
};

const labelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const rowListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
  alignItems: 'center',
};

const noteStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

const sectionTitleStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-2)',
  fontSize: 'var(--tai-text-md)',
  color: 'var(--tai-color-text)',
};

const pendingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  margin: 0,
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

/** The recycle section: one row per worker, joining a fresh life sharing its name. */
function RecycleSection({ report }: { readonly report: ApplyResponse }): ReactNode {
  if (report.recycle.length === 0) {
    return <p style={noteStyle}>No process recycle was needed.</p>;
  }
  return (
    <ul style={rowListStyle} data-testid="apply-recycle">
      {report.recycle.map((entry) => {
        const joined = report.fresh.find((life) => life.name === entry.name);
        return (
          <li
            key={`${entry.name}-${entry.kind}-${String(entry.generation_before)}`}
            className="tai-row"
          >
            <span className="tai-mono">{entry.name}</span>
            <Badge variant="neutral">{entry.kind}</Badge>
            <Badge variant={entry.status === 'self-deferred' ? 'warning' : 'primary'}>
              {entry.status}
            </Badge>
            <span style={labelStyle}>
              {joined !== undefined
                ? `life ${String(entry.generation_before)} to ${String(joined.generation)}`
                : `life ${String(entry.generation_before)}`}
            </span>
            {entry.status === 'self-deferred' ? (
              <span style={labelStyle}>
                this worker (the applier) recycles itself after replying
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The dedicated apply report (names-only — no env value appears). The fleet fan-out
 * surfaces any failed propagation; `hot` names the in-place swaps; `recycle` is the
 * per-worker orchestration; `fresh` is the new ready lives observed since the
 * pre-apply snapshot; `refused` (empty on success) names any boundary refusal. A
 * fresh life sharing a recycled target's NAME is joined onto that row for display only.
 */
function ApplyReport({ report }: { readonly report: ApplyResponse }): ReactNode {
  const recycledNames = new Set(report.recycle.map((entry) => entry.name));
  const unjoinedFresh = report.fresh.filter((life) => !recycledNames.has(life.name));
  return (
    <div className="tai-stack" data-testid="apply-report">
      <FleetReport summary={summarizeFleetFanout(report.fanout)} />

      <section>
        <h4 style={sectionTitleStyle}>Hot-swapped</h4>
        {report.hot.length === 0 ? (
          <p style={noteStyle}>No keys were hot-swapped.</p>
        ) : (
          <div style={actionsStyle}>
            {report.hot.map((key) => (
              <Badge key={key} variant="success">
                {key}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section>
        <h4 style={sectionTitleStyle}>Recycle</h4>
        <RecycleSection report={report} />
      </section>

      {unjoinedFresh.length > 0 ? (
        <section>
          <h4 style={sectionTitleStyle}>Fresh lives</h4>
          <ul style={rowListStyle} data-testid="apply-fresh">
            {unjoinedFresh.map((life) => (
              <li key={`${life.name}-${life.kind}-${String(life.generation)}`} className="tai-row">
                <span className="tai-mono">{life.name}</span>
                <Badge variant="neutral">{life.kind}</Badge>
                <span style={labelStyle}>life {String(life.generation)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.refused.length > 0 ? (
        <div role="alert" style={dangerPanelStyle} data-testid="apply-refused">
          <strong>Refused</strong>
          <ul style={{ margin: 0, paddingLeft: 'var(--tai-space-4)' }}>
            {report.refused.map((entry) => (
              <li key={entry.key}>
                <span className="tai-mono">{entry.key}</span> — {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ApplyProfileDialog({
  name,
  title,
  intro,
  onClose,
}: {
  readonly name: string;
  readonly title: string;
  readonly intro: string;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const diffQuery = useQuery({
    queryKey: [...settingsProfileKey(name), 'diff'],
    queryFn: () => api.diffSettingsProfile(name),
  });

  const apply = useMutation({
    mutationFn: () => {
      // Defense-in-depth for a fenced, destructive action: never issue a partial
      // apply. If the reviewed diff carries boundary-refused keys, abort loudly
      // rather than send — the disabled button is the first gate, this is the last.
      assertApplyable(diffQuery.data?.refused_keys ?? []);
      return api.applySettingsProfile(name);
    },
    onSuccess: () => {
      // Apply full-replaces the live env and re-versions the profile.
      void queryClient.invalidateQueries({ queryKey: settingsProfilesKey });
      void queryClient.invalidateQueries({ queryKey: settingsProfileKey(name) });
      void queryClient.invalidateQueries({ queryKey: settingsProfileVersionsKey(name) });
      void queryClient.invalidateQueries({ queryKey: envConfigKey });
    },
  });

  const refusedByDiff = diffQuery.data !== undefined && diffQuery.data.refused_keys.length > 0;
  const canApply = diffQuery.isSuccess && !refusedByDiff && !apply.isPending;

  return (
    <Dialog
      title={title}
      description={intro}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div className="tai-stack">
        {apply.isSuccess ? (
          <ApplyReport report={apply.data} />
        ) : (
          <>
            <p style={dangerPanelStyle}>
              <strong>This is destructive.</strong>
              <span>
                Applying replaces the deployment&rsquo;s profile-managed environment and reloads the
                worker fleet. Review the change below before applying.
              </span>
            </p>

            {diffQuery.isPending ? <Spinner label="Computing diff" /> : null}
            {diffQuery.isError ? (
              <ErrorState
                message={errorMessage(diffQuery.error)}
                onRetry={() => void diffQuery.refetch()}
              />
            ) : null}
            {diffQuery.isSuccess ? <DiffCallouts diff={diffQuery.data} /> : null}

            {apply.isPending ? (
              <p role="status" style={pendingStyle}>
                <Spinner label="Applying" />
                {`Applying profile ${name} across the fleet - this can take up to 30 seconds.`}
              </p>
            ) : null}

            {apply.isError ? <ErrorState message={errorMessage(apply.error)} /> : null}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button type="button" onClick={onClose}>
            {apply.isSuccess ? 'Close' : 'Cancel'}
          </Button>
          {apply.isSuccess ? null : (
            <Button
              type="button"
              variant="danger"
              disabled={!canApply}
              onClick={() => {
                if (!canApply) return;
                apply.mutate();
              }}
            >
              Apply profile
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
