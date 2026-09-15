/**
 * The per-subject record page (`?state=&subject=<kind>:<key>&target=<tk>:<tn>`). The
 * subject/target params are decoded by {@link parseSubjectRef}; a malformed link shows
 * a repair prompt rather than a doomed read.
 *
 * The document card ({@link RecordDocumentCard}) edits through the effective schema's
 * form or a JSON textarea; `Erase` is a danger-confirm delete. `Fold into`
 * ({@link FoldCard}) merges this subject into another; `Writes` ({@link WritesCard}) is
 * the paged audit trail.
 */
import type { StateSubjectRef } from '@tai42/api-client';
import {
  AppLink,
  ArrowLeftIcon,
  Card,
  CopyField,
  EmptyState,
  errorMessage,
  ErrorState,
  FeatureDisabled,
  featureDisabledMessage,
  isFeatureDisabled,
} from '@tai42/studio-sdk';
import { type ReactNode, useMemo } from 'react';

import { FoldCard } from './FoldCard';
import { parseSubjectRef } from './record-subject';
import { RecordDocumentCard } from './RecordDocumentCard';
import { useStateRecord } from './useStateRecord';
import { WritesCard } from './WritesCard';

export function RecordPage({
  stateName,
  subjectParam,
  targetParam,
}: {
  readonly stateName: string;
  readonly subjectParam: string | undefined;
  readonly targetParam: string | undefined;
}): ReactNode {
  const subject = useMemo(
    () => parseSubjectRef(subjectParam, targetParam),
    [subjectParam, targetParam],
  );

  if (subject === null) {
    return (
      <Card>
        <EmptyState
          title="This record link is incomplete"
          description="Open a record from the state's Records tab so its subject and target are set."
        />
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <AppLink
            to="states"
            search={{ state: stateName, tab: 'records' }}
            className="tai-btn tai-btn-ghost"
          >
            <ArrowLeftIcon />
            Back to {stateName}
          </AppLink>
        </div>
      </Card>
    );
  }

  return <RecordPageBody stateName={stateName} subject={subject} />;
}

/** The back-to-state link shown above the record header and on a load error. */
function BackLink({ stateName }: { readonly stateName: string }): ReactNode {
  return (
    <AppLink
      to="states"
      search={{ state: stateName, tab: 'records' }}
      className="tai-btn tai-btn-ghost"
      aria-label={`Back to ${stateName}`}
    >
      <ArrowLeftIcon />
      Back to {stateName}
    </AppLink>
  );
}

function RecordPageBody({
  stateName,
  subject,
}: {
  readonly stateName: string;
  readonly subject: StateSubjectRef;
}): ReactNode {
  const rec = useStateRecord({ stateName, subject });
  const { detailQuery, recordQuery } = rec;

  if (recordQuery.isError && isFeatureDisabled(recordQuery.error)) {
    return <FeatureDisabled feature="States" message={featureDisabledMessage(recordQuery.error)} />;
  }
  if (detailQuery.isError && isFeatureDisabled(detailQuery.error)) {
    return <FeatureDisabled feature="States" message={featureDisabledMessage(detailQuery.error)} />;
  }
  // The declaration read drives the editor's schema AND the fold's kinds. A failure that
  // is not the OFF state must surface loudly — never a silent fall to the raw JSON editor.
  if (detailQuery.isError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        <div>
          <BackLink stateName={stateName} />
        </div>
        <ErrorState
          message={errorMessage(detailQuery.error)}
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-5)' }}
      data-testid="record-page"
    >
      <div>
        <BackLink stateName={stateName} />
      </div>

      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--tai-text-lg)' }} tabIndex={-1}>
          <span style={{ fontFamily: 'var(--tai-font-mono)' }}>{subject.kind}</span>{' '}
          <span style={{ fontFamily: 'var(--tai-font-mono)' }}>{subject.key}</span>
          <span style={{ color: 'var(--tai-color-text-muted)' }}>
            {' '}
            · {subject.target_kind} {subject.target_name}
          </span>
        </h2>
        <CopyField value={subject.key} label="Subject key" />
      </header>

      <RecordDocumentCard subject={subject} rec={rec} />

      <FoldCard
        stateName={stateName}
        subject={subject}
        kinds={detailQuery.data?.subject_kinds ?? []}
        disabled={rec.record === null}
      />

      <WritesCard stateName={stateName} subject={subject} />
    </div>
  );
}
