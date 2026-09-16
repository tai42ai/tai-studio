/**
 * The admin's principal picker for minting a key: a `Select` of the caller's own
 * principal (first, marked "you") then every service principal, plus a "Create a
 * service principal…" entry that reveals the inline create sub-form. The chosen
 * principal is lifted to the caller as a {@link PrincipalRef} — the owner the mint
 * body names. The list is admin-only and fetched with {@link usePrincipalsQuery}.
 */
import type { Principal, PrincipalRef } from '@tai42/api-client';
import { errorMessage, ErrorState, Select, type SelectOption } from '@tai42/studio-sdk';
import { type CSSProperties, type ReactNode, useState } from 'react';

import { CreatePrincipalForm } from './CreatePrincipalForm';
import { usePrincipalsQuery } from './use-principals';

/** The sentinel option value that opens the inline create sub-form. */
const CREATE_VALUE = '__create-service-principal__';

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
};

/** Narrow a listed principal to the compact reference the owner line and mint body use. */
function toRef(principal: Principal | PrincipalRef): PrincipalRef {
  return {
    user_id: principal.user_id,
    kind: principal.kind,
    display_name: principal.display_name,
  };
}

export function PrincipalPicker({
  selfPrincipal,
  value,
  onChange,
}: {
  readonly selfPrincipal: PrincipalRef | null;
  readonly value: PrincipalRef | null;
  readonly onChange: (principal: PrincipalRef | null) => void;
}): ReactNode {
  const principalsQuery = usePrincipalsQuery();
  const [showCreate, setShowCreate] = useState(false);

  if (principalsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(principalsQuery.error)}
        onRetry={() => void principalsQuery.refetch()}
      />
    );
  }

  // Everything the picker can resolve a chosen id back to: the caller's own principal,
  // every service principal, and the current value (a just-created principal the list
  // has not refetched yet), de-duplicated by id and preserving that order.
  const known = new Map<string, { ref: PrincipalRef; label: string }>();
  if (selfPrincipal !== null) {
    known.set(selfPrincipal.user_id, {
      ref: selfPrincipal,
      label: `${selfPrincipal.display_name} (you)`,
    });
  }
  for (const principal of principalsQuery.data ?? []) {
    if (principal.kind !== 'service' || known.has(principal.user_id)) continue;
    known.set(principal.user_id, { ref: toRef(principal), label: principal.display_name });
  }
  if (value !== null && !known.has(value.user_id)) {
    known.set(value.user_id, { ref: value, label: value.display_name });
  }

  const options: SelectOption[] = [
    ...[...known.values()].map((entry) => ({ value: entry.ref.user_id, label: entry.label })),
    { value: CREATE_VALUE, label: 'Create a service principal…' },
  ];

  return (
    <div style={stackStyle}>
      <Select
        aria-label="Principal"
        options={options}
        value={value?.user_id ?? ''}
        disabled={principalsQuery.isPending}
        placeholder={principalsQuery.isPending ? 'Loading principals…' : 'Select a principal'}
        onValueChange={(next) => {
          if (next === CREATE_VALUE) {
            setShowCreate(true);
            return;
          }
          setShowCreate(false);
          onChange(known.get(next)?.ref ?? null);
        }}
      />
      {showCreate ? (
        <CreatePrincipalForm
          onCreated={(principal) => {
            setShowCreate(false);
            onChange(toRef(principal));
          }}
          onCancel={() => {
            setShowCreate(false);
          }}
        />
      ) : null}
    </div>
  );
}
