/**
 * The fold card: merge this subject's document into another subject of a chosen kind, behind a
 * danger confirm (a fold cannot be undone). A refused fold renders in the confirm.
 */
import type { StateSubjectRef } from '@tai42/api-client';
import { Button, Card, ConfirmDialog, Field, Select, TextInput, useApi } from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { stateRecordKey, stateWritesKey } from './keys';

export interface FoldCardProps {
  readonly stateName: string;
  readonly subject: StateSubjectRef;
  readonly kinds: readonly string[];
  readonly disabled: boolean;
}

export function FoldCard({ stateName, subject, kinds, disabled }: FoldCardProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState(subject.kind);
  const [key, setKey] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.foldStateRecord(
        stateName,
        subject,
        {
          target_kind: subject.target_kind,
          target_name: subject.target_name,
          kind,
          key: key.trim(),
        },
        'merge',
      ),
    onSuccess: () => {
      setConfirmOpen(false);
      setKey('');
      void queryClient.invalidateQueries({ queryKey: stateRecordKey(stateName, subject) });
      // After a fold this subject's write trail reads through to the target, fold row included.
      void queryClient.invalidateQueries({ queryKey: stateWritesKey(stateName, subject) });
    },
  });

  const kindOptions = (kinds.length > 0 ? kinds : [subject.kind]).map((k) => ({
    value: k,
    label: k,
  }));

  const target = `${kind} ${key.trim()}`;

  return (
    <>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Fold into</h3>
          <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
            Merge this subject&rsquo;s document into another subject; this subject then resolves to
            that one.
          </p>
          <div style={{ display: 'flex', gap: 'var(--tai-space-3)', flexWrap: 'wrap' }}>
            <Field label="Kind">
              {/* Ignore a transient empty value (Radix clears a controlled value the same
                render its options change, when the async kind list arrives). */}
              <Select
                value={kind}
                onValueChange={(next) => {
                  if (next !== '') setKind(next);
                }}
                options={kindOptions}
              />
            </Field>
            <Field label="Key">
              <TextInput
                value={key}
                placeholder="target subject key"
                onChange={(event) => {
                  setKey(event.target.value);
                }}
              />
            </Field>
          </div>
          <div>
            <Button
              type="button"
              onClick={() => {
                mutation.reset();
                setConfirmOpen(true);
              }}
              disabled={disabled || key.trim() === ''}
            >
              Fold
            </Button>
          </div>
        </div>
      </Card>

      {confirmOpen ? (
        <ConfirmDialog
          title="Fold subject"
          confirmLabel="Fold"
          pendingLabel="Folding"
          confirmVariant="danger"
          isPending={mutation.isPending}
          error={mutation.error}
          onConfirm={() => {
            mutation.mutate();
          }}
          onClose={() => {
            if (!mutation.isPending) setConfirmOpen(false);
          }}
        >
          Fold &lsquo;{subject.kind} {subject.key}&rsquo; into &lsquo;{target}&rsquo;? Its document
          merges into the document of &lsquo;{target}&rsquo;; where both have a member, &lsquo;
          {target}&rsquo; keeps its own value. Then this subject&rsquo;s document is deleted, and
          this subject, with any subjects already folded into it, resolves to &lsquo;{target}
          &rsquo; from now on. This cannot be undone.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
