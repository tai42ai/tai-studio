/** The fold card: merge this subject's document into another subject of a chosen kind. */
import type { StateSubjectRef } from '@tai42/api-client';
import {
  Button,
  Card,
  errorMessage,
  Field,
  Select,
  Spinner,
  TextInput,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { stateRecordKey } from './keys';

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
      setKey('');
      void queryClient.invalidateQueries({ queryKey: stateRecordKey(stateName, subject) });
    },
  });

  const kindOptions = (kinds.length > 0 ? kinds : [subject.kind]).map((k) => ({
    value: k,
    label: k,
  }));

  return (
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
        {mutation.isError ? (
          <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
            {errorMessage(mutation.error)}
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            onClick={() => {
              mutation.mutate();
            }}
            disabled={disabled || key.trim() === '' || mutation.isPending}
          >
            {mutation.isPending ? <Spinner label="Folding" /> : null}
            Fold
          </Button>
        </div>
      </div>
    </Card>
  );
}
