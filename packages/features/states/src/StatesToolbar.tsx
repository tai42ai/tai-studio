/**
 * The states list header: Refresh, an Upload door (a hidden `.json` file input the
 * Upload button triggers), and Declare state. A spinner rides Refresh while the list
 * refetches and Upload while a document uploads.
 */
import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { Button, Spinner } from '@tai42/studio-sdk';

export interface StatesToolbarProps {
  readonly refreshing: boolean;
  readonly uploading: boolean;
  readonly onRefresh: () => void;
  readonly onDeclare: () => void;
  readonly onFile: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function StatesToolbar({
  refreshing,
  uploading,
  onRefresh,
  onDeclare,
  onFile,
}: StatesToolbarProps): ReactNode {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--tai-space-2)',
      }}
    >
      <h2 className="tai-card-title">All states</h2>
      <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
        <Button type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? <Spinner label="Refreshing" /> : null}
          Refresh
        </Button>
        <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Spinner label="Uploading" /> : null}
          Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
          onChange={onFile}
        />
        <Button type="button" variant="primary" onClick={onDeclare}>
          Declare state
        </Button>
      </div>
    </header>
  );
}
