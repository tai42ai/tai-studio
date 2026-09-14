/**
 * The sub-services consent fieldset for the connect form: one checkbox per
 * sub-service, each showing its description AND the scopes it grants.
 */
import type { ReactNode } from 'react';
import { Checkbox } from '@tai42/studio-sdk';
import type { ProviderView } from '@tai42/api-client';

export function SubServicesFieldset({
  subServices,
  enabled,
  onToggle,
}: {
  readonly subServices: ProviderView['sub_services'];
  readonly enabled: ReadonlySet<string>;
  readonly onToggle: (id: string, checked: boolean) => void;
}): ReactNode {
  if (subServices.length === 0) return null;
  return (
    <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
      <legend style={{ fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>Sub-services</legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        {subServices.map((service) => (
          <div
            key={service.id}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}
          >
            <Checkbox
              label={service.display_name}
              checked={enabled.has(service.id)}
              onCheckedChange={(checked) => {
                onToggle(service.id, checked);
              }}
            />
            {/* A consent surface: the description AND the scopes are shown together
                (never one hiding the other) so the operator sees the access each
                sub-service grants before enabling it. */}
            <div
              style={{
                marginLeft: 'var(--tai-space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--tai-space-1)',
                fontSize: 'var(--tai-text-sm)',
                color: 'var(--tai-color-text-muted)',
              }}
            >
              {service.description !== '' ? <span>{service.description}</span> : null}
              {service.scopes.length > 0 ? (
                <span>
                  Scopes: <span className="tai-mono">{service.scopes.join(', ')}</span>
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
