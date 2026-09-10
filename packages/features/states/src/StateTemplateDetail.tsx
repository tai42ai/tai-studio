/**
 * The state-template screen — a READ-ONLY view of one uploaded state-template
 * document (`GET /api/state-templates/{name}`), over two tabs:
 *
 *  - Template: the fields (`schema`) as a read-only tree, the write policies
 *    (`regimes`) as a table, the check jq behind a disclosure, and the parameters
 *    as a table.
 *  - Jq: every template jq by name, purpose, description, and its declared
 *    params / writes, each with its jq behind a disclosure.
 *
 * The document is uploaded whole by `tai state-templates put`; this screen never
 * edits it.
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AppLink,
  ArrowLeftIcon,
  Badge,
  Card,
  CodeBlock,
  EmptyState,
  ErrorState,
  JsonTree,
  Skeleton,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  isFeatureDisabled,
  featureDisabledMessage,
  FeatureDisabled,
  useApi,
} from '@tai42/studio-sdk';
import { ApiError, type StateTemplateDocument, type TemplateJq } from '@tai42/api-client';

import { stateTemplateDetailKey } from './keys';

/** The check jq a template declares, read from `declarations.check`; `null` when absent. */
function checkJq(document: StateTemplateDocument): string | null {
  const declarations = document.declarations;
  if (declarations === null) return null;
  const check = (declarations as { check?: unknown }).check;
  return typeof check === 'string' && check !== '' ? check : null;
}

/** A regime row's Path and Policy, read defensively from the free-form regime entry. */
function regimeCells(
  regime: Record<string, unknown>,
  index: number,
): {
  readonly path: string;
  readonly policy: string;
} {
  const rawPath = regime.path;
  const path = Array.isArray(rawPath)
    ? rawPath.map((segment) => String(segment)).join(' / ') || '(root)'
    : typeof rawPath === 'string'
      ? rawPath
      : `(regime ${String(index + 1)})`;
  const rawPolicy = regime.policy ?? regime.mode ?? regime.regime;
  const policy = typeof rawPolicy === 'string' ? rawPolicy : JSON.stringify(regime);
  return { path, policy };
}

/** A keyboard-native "Show jq" disclosure over one jq program. */
function ShowJq({ label, jq }: { readonly label: string; readonly jq: string }): ReactNode {
  return (
    <details>
      <summary aria-label={label} style={{ cursor: 'pointer' }}>
        Show jq
      </summary>
      <CodeBlock code={jq} language="jq" />
    </details>
  );
}

function Chips({ items }: { readonly items: readonly string[] }): ReactNode {
  if (items.length === 0) return <>—</>;
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--tai-space-1)', flexWrap: 'wrap' }}>
      {items.map((item) => (
        <Badge key={item} variant="neutral">
          {item}
        </Badge>
      ))}
    </span>
  );
}

function TemplateTab({ document }: { readonly document: StateTemplateDocument }): ReactNode {
  const schema = document.schema;
  const regimes = document.regimes;
  const parameters = document.parameters;
  const check = checkJq(document);
  const hasSchema = Object.keys(schema).length > 0;
  const parameterEntries = Object.entries(parameters);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-5)' }}>
      {hasSchema ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Fields</h3>
          <JsonTree data={schema} label="Fields" />
        </section>
      ) : null}

      {regimes.length > 0 ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Write policies</h3>
          <Table>
            <THead>
              <TR>
                <TH>Path</TH>
                <TH>Policy</TH>
              </TR>
            </THead>
            <TBody>
              {regimes.map((regime, index) => {
                const cells = regimeCells(regime, index);
                return (
                  <TR key={`${cells.path}:${String(index)}`}>
                    <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{cells.path}</TD>
                    <TD>{cells.policy}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </section>
      ) : null}

      {check !== null ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Check</h3>
          <ShowJq label="Show jq for the check" jq={check} />
        </section>
      ) : null}

      {parameterEntries.length > 0 ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Parameters</h3>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Default</TH>
              </TR>
            </THead>
            <TBody>
              {parameterEntries.map(([name, value]) => (
                <TR key={name}>
                  <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{name}</TD>
                  <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{JSON.stringify(value)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}

function JqTab({ document }: { readonly document: StateTemplateDocument }): ReactNode {
  const templateJq = document.template_jq;
  const entries: [string, TemplateJq][] = templateJq === null ? [] : Object.entries(templateJq);

  if (entries.length === 0) {
    return (
      <EmptyState title="No template jq" description="This template declares no template jq." />
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Purpose</TH>
            <TH>Description</TH>
            <TH>Params / Writes</TH>
            <TH>Jq</TH>
          </TR>
        </THead>
        <TBody>
          {entries.map(([name, jq]) => (
            <TR key={name}>
              <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{name}</TD>
              <TD>
                <Badge variant={jq.purpose === 'input' ? 'primary' : 'neutral'}>{jq.purpose}</Badge>
              </TD>
              <TD>{jq.description || '—'}</TD>
              <TD>
                {jq.purpose === 'input' ? (
                  <Chips items={jq.params} />
                ) : (
                  <Chips items={jq.writes.map((path) => path.join('.'))} />
                )}
              </TD>
              <TD>
                <ShowJq label={`Show jq for ${name}`} jq={jq.jq} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export function StateTemplateDetail({ name }: { readonly name: string }): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: stateTemplateDetailKey(name),
    queryFn: ({ signal }) => api.getStateTemplate(name, signal),
  });

  if (query.isError && isFeatureDisabled(query.error)) {
    return (
      <Card>
        <FeatureDisabled feature="States" message={featureDisabledMessage(query.error)} />
      </Card>
    );
  }
  if (query.isError && query.error instanceof ApiError && query.error.status === 404) {
    return (
      <Card>
        <EmptyState
          title={`No template named '${name}'`}
          description="It may have been deleted. Choose another template from the list."
        />
      </Card>
    );
  }
  if (query.isPending) {
    return (
      <Card>
        <Skeleton height={240} />
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card>
        <ErrorState message="Couldn't load this template." onRetry={() => void query.refetch()} />
      </Card>
    );
  }

  const document = query.data;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      data-testid="state-template-detail"
    >
      <div>
        <AppLink
          to="states"
          search={{}}
          className="tai-btn tai-btn-ghost"
          aria-label="Back to states"
        >
          <ArrowLeftIcon />
          Back to states
        </AppLink>
      </div>

      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--tai-text-lg)' }}>{document.name}</h2>
        {document.description !== '' ? (
          <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>{document.description}</p>
        ) : null}
      </header>

      <Tabs
        items={[
          { value: 'template', label: 'Template', content: <TemplateTab document={document} /> },
          { value: 'jq', label: 'Jq', content: <JqTab document={document} /> },
        ]}
        defaultValue="template"
      />
    </div>
  );
}
