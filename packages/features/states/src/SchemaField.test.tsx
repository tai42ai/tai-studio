/**
 * `SchemaField` authors the base-schema `TemplatedText | dict` union: an inline JSON editor
 * for the dict arm, the shared templated-text picker for the stored-reference arm. These
 * tests pin that the generated zod accepts BOTH arms, that an inline edit emits the parsed
 * dict, and that a stored reference is shown read-only when storage is absent.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { schemas } from '@tai42/api-client';
import type { TemplatedTextCatalog } from '@tai42/studio-sdk';

import { SchemaField, storedSchemaRef, type SchemaFieldChange } from './SchemaField';

/** A minimal valid served declaration, its `schema` swapped per case. */
function declaration(schema: unknown): Record<string, unknown> {
  return { name: 'profile', default_subject_kind: 'person', subject_kinds: ['person'], schema };
}

/** A minimal valid state-template document, its `schema` swapped per case. */
function template(schema: unknown): Record<string, unknown> {
  return { kind: 'state-template', name: 'prefs', schema };
}

/** A storage-absent catalog: the field offers only its inline JSON body. */
const ABSENT_CATALOG: TemplatedTextCatalog = {
  templates: [],
  loading: false,
  error: undefined,
  onRetry: () => undefined,
  storageAbsent: true,
  storagePresenceLoading: false,
};

describe('served-schema union arms', () => {
  const INLINE = { type: 'object', properties: { a: { type: 'string' } } };
  const STORED = { id: 'profile-schema', kwargs: { locale: 'en' } };

  it('stateDeclaration accepts an inline dict schema and a stored-reference schema', () => {
    expect(schemas.stateDeclaration.parse(declaration(INLINE)).schema).toEqual(INLINE);
    expect(schemas.stateDeclaration.parse(declaration(STORED)).schema).toEqual(STORED);
  });

  it('stateTemplateDocument accepts an inline dict schema and a stored-reference schema', () => {
    expect(schemas.stateTemplateDocument.parse(template(INLINE)).schema).toEqual(INLINE);
    expect(schemas.stateTemplateDocument.parse(template(STORED)).schema).toEqual(STORED);
  });

  it('storedSchemaRef distinguishes a stored reference from an inline dict', () => {
    expect(storedSchemaRef(STORED)?.id).toBe('profile-schema');
    expect(storedSchemaRef(INLINE)).toBeNull();
    expect(storedSchemaRef(null)).toBeNull();
  });
});

describe('SchemaField', () => {
  it('emits the parsed inline dict on an edit', () => {
    const onChange = vi.fn<(change: SchemaFieldChange) => void>();
    render(
      <SchemaField label="Base schema" value={null} onChange={onChange} catalog={ABSENT_CATALOG} />,
    );
    fireEvent.change(screen.getByLabelText('Base schema JSON'), {
      target: { value: '{"type":"object","properties":{"a":{"type":"string"}}}' },
    });
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last?.valid).toBe(true);
    expect(last?.schema).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
  });

  it('reports invalid while the inline JSON does not parse', () => {
    const onChange = vi.fn<(change: SchemaFieldChange) => void>();
    render(
      <SchemaField label="Base schema" value={null} onChange={onChange} catalog={ABSENT_CATALOG} />,
    );
    fireEvent.change(screen.getByLabelText('Base schema JSON'), {
      target: { value: '{ not json' },
    });
    expect(onChange.mock.calls.at(-1)?.[0].valid).toBe(false);
  });

  it('shows a stored reference read-only when storage is absent', () => {
    render(
      <SchemaField
        label="Base schema"
        value={{ id: 'profile-schema' }}
        onChange={vi.fn()}
        catalog={ABSENT_CATALOG}
      />,
    );
    expect(screen.getByText('Stored template')).toBeInTheDocument();
    expect(screen.getByText('profile-schema')).toBeInTheDocument();
  });
});
