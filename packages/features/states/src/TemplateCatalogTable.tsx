/** The state-template catalog table: name, description, attach count, shipped flag, delete. */
import type { ReactNode } from 'react';
import { AppLink, Badge, Button, TBody, TD, TH, THead, TR, Table } from '@tai42/studio-sdk';
import type { StateTemplateListItem } from '@tai42/api-client';

export interface TemplateCatalogTableProps {
  readonly templates: readonly StateTemplateListItem[];
  readonly onDelete: (name: string) => void;
}

export function TemplateCatalogTable({
  templates,
  onDelete,
}: TemplateCatalogTableProps): ReactNode {
  return (
    <div style={{ overflowX: 'auto' }}>
      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Description</TH>
            <TH>Attached to</TH>
            <TH>Shipped</TH>
            <TH>Actions</TH>
          </TR>
        </THead>
        <TBody>
          {templates.map((template) => (
            <TR key={template.name}>
              <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>
                <AppLink
                  to="states"
                  search={{ template: template.name }}
                  aria-label={`Open template ${template.name}`}
                >
                  {template.name}
                </AppLink>
              </TD>
              <TD>{template.description || '—'}</TD>
              <TD>{template.attached_to}</TD>
              <TD>
                {template.shipped_default ? <Badge variant="neutral">shipped default</Badge> : '—'}
              </TD>
              <TD>
                <Button
                  type="button"
                  variant="danger"
                  disabled={template.attached_to > 0}
                  title={
                    template.attached_to > 0
                      ? 'Detach this template from every state before deleting it.'
                      : undefined
                  }
                  onClick={() => {
                    onDelete(template.name);
                  }}
                >
                  Delete
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
