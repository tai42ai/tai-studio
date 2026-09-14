/**
 * The profile diff review: the recycle/refused key callouts shared with the apply
 * flow, and the read-only masked diff dialog. The diff route carries REAL env values,
 * so the preview masks every value — the key names and the recycle/refused lists are
 * the actionable safety information.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  ErrorState,
  JsonDiff,
  ScrollRegion,
  Spinner,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { settingsProfileKey } from './keys';
import { maskedDiffSides, type ProfileDiff } from './profile-secrets';

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

const warnPanelStyle: CSSProperties = { margin: '0 0 var(--tai-space-3)' };

/** The recycle-class and boundary-refused key callouts — shown before any apply. */
export function DiffCallouts({ diff }: { readonly diff: ProfileDiff }): ReactNode {
  return (
    <>
      {diff.refused_keys.length > 0 ? (
        <div role="alert" style={dangerPanelStyle} data-testid="diff-refused">
          <strong>Refused keys — apply is blocked</strong>
          <span>
            These keys are refused at the profile boundary (key material / infrastructure identity)
            and cannot be applied:
          </span>
          <span className="tai-mono">{diff.refused_keys.join(', ')}</span>
        </div>
      ) : null}
      {diff.recycle_keys.length > 0 ? (
        <p role="note" className="tai-warn-state" style={warnPanelStyle} data-testid="diff-recycle">
          These keys need a process recycle to take effect — applying orchestrates a rolling
          restart: <span className="tai-mono">{diff.recycle_keys.join(', ')}</span>
        </p>
      ) : null}
    </>
  );
}

export function DiffDialog({
  name,
  onClose,
}: {
  readonly name: string;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const diffQuery = useQuery({
    queryKey: [...settingsProfileKey(name), 'diff'],
    queryFn: () => api.diffSettingsProfile(name),
  });

  let body: ReactNode;
  if (diffQuery.isPending) {
    body = <Spinner label="Computing diff" />;
  } else if (diffQuery.isError) {
    body = (
      <ErrorState
        message={errorMessage(diffQuery.error)}
        onRetry={() => void diffQuery.refetch()}
      />
    );
  } else {
    const { before, after } = maskedDiffSides(diffQuery.data);
    body = (
      <div className="tai-stack">
        <DiffCallouts diff={diffQuery.data} />
        <ScrollRegion label="Profile diff">
          <JsonDiff before={before} after={after} />
        </ScrollRegion>
      </div>
    );
  }

  return (
    <Dialog
      title={`Diff — ${name}`}
      description="The saved profile compared with the live environment. Values are masked."
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div className="tai-stack">
        {body}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
