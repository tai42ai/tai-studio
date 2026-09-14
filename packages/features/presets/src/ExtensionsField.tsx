/**
 * The labelled "Extensions" group: the available-extensions read plus the
 * `ExtensionComboBuilder` over the ordered extension sets applied to the preset
 * tool. A labelled GROUP, not a `Field` — the builder nests many checkboxes, and a
 * single `Field` would hand them all one shared control id (breaking their label
 * clicks). Shared by the create form and the save-version dialog.
 */
import { useId, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { PresetExtensionElement } from '@tai42/api-client';
import { ErrorState, ExtensionComboBuilder, errorMessage, useApi } from '@tai42/studio-sdk';

import { presetExtensionsKey } from './keys';

export function ExtensionsField({
  value,
  onChange,
  onValidityChange,
}: {
  readonly value: PresetExtensionElement[][];
  readonly onChange: (value: PresetExtensionElement[][]) => void;
  // The builder reports whether the combos carry only known names; an unknown name
  // blocks submit + validate.
  readonly onValidityChange: (valid: boolean) => void;
}): ReactNode {
  const api = useApi();
  const query = useQuery({ queryKey: presetExtensionsKey, queryFn: () => api.listExtensions() });
  const labelId = useId();
  const descId = useId();

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={descId}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}
    >
      <span id={labelId} style={{ fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>
        Extensions
      </span>
      <span
        id={descId}
        style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}
      >
        Ordered extension sets applied to the preset tool.
      </span>
      {query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <ExtensionComboBuilder
          available={query.data ?? []}
          value={value}
          onChange={onChange}
          disabled={query.isPending}
          onValidityChange={onValidityChange}
          availableReady={query.isSuccess}
        />
      )}
    </div>
  );
}
