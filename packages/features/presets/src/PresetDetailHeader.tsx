/**
 * The preset detail header: the mono-typed name (with a Conflicted badge for a
 * quarantined record) and the lifecycle action cluster. The heading is the focus
 * target for the page's master/detail focus management (WCAG 2.4.3).
 */
import { Badge } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode, Ref } from 'react';

import { PresetDetailActions } from './PresetDetailActions';

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-4)',
  flexWrap: 'wrap',
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-lg)',
  fontFamily: 'var(--tai-font-mono)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  overflowWrap: 'break-word',
};

export function PresetDetailHeader({
  presetName,
  conflicted,
  headingRef,
  metaReady,
  metaWriteDisabled,
  onNewVersion,
  onEditDetails,
  onRename,
  onDelete,
}: {
  readonly presetName: string;
  readonly conflicted: boolean;
  readonly headingRef?: Ref<HTMLHeadingElement>;
  readonly metaReady: boolean;
  readonly metaWriteDisabled: boolean;
  readonly onNewVersion: () => void;
  readonly onEditDetails: () => void;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  return (
    <header style={headerStyle}>
      <h2 ref={headingRef} tabIndex={-1} style={headingStyle}>
        {presetName}
        {conflicted ? <Badge variant="danger">Conflicted</Badge> : null}
      </h2>
      <PresetDetailActions
        presetName={presetName}
        conflicted={conflicted}
        metaReady={metaReady}
        metaWriteDisabled={metaWriteDisabled}
        onNewVersion={onNewVersion}
        onEditDetails={onEditDetails}
        onRename={onRename}
        onDelete={onDelete}
      />
    </header>
  );
}
