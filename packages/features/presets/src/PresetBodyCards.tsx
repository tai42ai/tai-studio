/**
 * The preset's baked-body cards: the active version's `fixed_kwargs` and, when set,
 * its `input_schema`, `input_map`, `output_schema` and `output_map`. The schemas and
 * kwargs render read-only via `JsonTree`; a map renders as its jq program, or as the
 * stored template it names.
 *
 * `fixed_kwargs` can carry credentials: it is rendered on this authed surface but
 * NEVER logged or toasted.
 */
import type { PresetDetail, TemplatedText } from '@tai42/api-client';
import { Card, CodeBlock, JsonTree, templatedTextSummary } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

const SECTION_STYLE = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
} as const;
const HEADING_STYLE = { margin: 0, fontSize: 'var(--tai-text-md)' } as const;

function BodySection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section style={SECTION_STYLE}>
      <h3 style={HEADING_STYLE}>{title}</h3>
      <Card>{children}</Card>
    </section>
  );
}

/** A map's body: the inline jq program, or the stored template a reference names. */
function MapBody({ map }: { readonly map: TemplatedText | string }): ReactNode {
  if (typeof map === 'string') return <CodeBlock code={map} language="jq" />;
  if (typeof map.id === 'string') {
    return <p style={{ margin: 0 }}>{templatedTextSummary(map)}</p>;
  }
  return <CodeBlock code={map.content ?? ''} language="jq" />;
}

export function PresetBodyCards({ preset }: { readonly preset: PresetDetail }): ReactNode {
  return (
    <>
      <BodySection title="Fixed kwargs">
        <JsonTree data={preset.fixed_kwargs} label="Fixed kwargs" />
      </BodySection>

      {preset.input_schema !== null ? (
        <BodySection title="Input schema">
          <JsonTree data={preset.input_schema} label="Input schema" />
        </BodySection>
      ) : null}

      {preset.input_map !== null ? (
        <BodySection title="Input map">
          <MapBody map={preset.input_map} />
        </BodySection>
      ) : null}

      {preset.output_schema !== null ? (
        <BodySection title="Output schema">
          <JsonTree data={preset.output_schema} label="Output schema" />
        </BodySection>
      ) : null}

      {preset.output_map !== null ? (
        <BodySection title="Output map">
          <MapBody map={preset.output_map} />
        </BodySection>
      ) : null}
    </>
  );
}
