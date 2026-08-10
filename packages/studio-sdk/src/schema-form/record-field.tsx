/**
 * The record (string-keyed map) field renderer. Each entry is a key input plus a
 * value editor built from the map's value schema; add appends a blank-key entry,
 * remove drops one by row. Rows carry a synthetic stable id — not their key — so
 * an entry keeps its identity (and focus) while its key is being typed, and so a
 * transiently blank or duplicate key never remounts a row or clobbers another.
 *
 * The emitted value is a plain object of the VALID entries. A blank key and a
 * duplicate key are held in local row state and surfaced (never emitted, never
 * silently merged): the map cannot represent two entries under one key, so the
 * later duplicate is withheld and flagged rather than overwriting the first.
 */
import { useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { CloseIcon } from '../components/icons';
import { Field } from '../components/field';
import { TextInput } from '../components/inputs';
import { Button } from '../components/primitives';
import { classifySchema } from './classify';
import { RecordEntryRendererContext } from './context';
import { defaultValueForSchema } from './default-value';
import { FieldGroup } from './field-group';
import { FieldNode } from './field-node';
import type { JsonSchema, SchemaFormErrors } from './types';

interface Row {
  readonly id: number;
  readonly key: string;
  readonly value: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The valid map plus the row ids the two structural key faults land on. */
interface Analysis {
  readonly value: Record<string, unknown>;
  readonly blankRowIds: ReadonlySet<number>;
  readonly duplicateRowIds: ReadonlySet<number>;
}

function analyzeRows(rows: readonly Row[]): Analysis {
  const value: Record<string, unknown> = {};
  const seen = new Set<string>();
  const blankRowIds = new Set<number>();
  const duplicateRowIds = new Set<number>();
  for (const row of rows) {
    if (row.key.trim() === '') {
      blankRowIds.add(row.id);
      continue;
    }
    if (seen.has(row.key)) {
      duplicateRowIds.add(row.id);
      continue;
    }
    seen.add(row.key);
    value[row.key] = row.value;
  }
  return { value, blankRowIds, duplicateRowIds };
}

export function RecordField({
  heading,
  description,
  error,
  values,
  root,
  value,
  onChange,
  path,
  errors,
  idPrefix,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  values: JsonSchema;
  root: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  path: string;
  errors: SchemaFormErrors | undefined;
  idPrefix: string;
}): ReactNode {
  const nextId = useRef(0);
  const rowsFromValue = (source: unknown): Row[] =>
    isPlainObject(source)
      ? Object.entries(source).map(([key, entryValue]) => ({
          id: nextId.current++,
          key,
          value: entryValue,
        }))
      : [];

  const [rows, setRows] = useState<Row[]>(() => rowsFromValue(value));
  // The last object THIS field emitted. A parent echoing our own value back
  // passes it identity-equal, so the rows (which may hold a blank/duplicate key
  // the emitted object cannot) survive; a parent that swaps in a different value
  // (a reset, another record loaded) fails the check and resyncs the rows.
  const lastEmitted = useRef<unknown>(value);
  if (value !== lastEmitted.current) {
    lastEmitted.current = value;
    setRows(rowsFromValue(value));
  }

  const renderEntry = useContext(RecordEntryRendererContext);

  const commit = (nextRows: Row[]): void => {
    setRows(nextRows);
    const emitted = analyzeRows(nextRows).value;
    lastEmitted.current = emitted;
    onChange(emitted);
  };
  const setKey = (id: number, key: string): void => {
    commit(rows.map((row) => (row.id === id ? { ...row, key } : row)));
  };
  const setValue = (id: number, next: unknown): void => {
    commit(rows.map((row) => (row.id === id ? { ...row, value: next } : row)));
  };
  const addRow = (): void => {
    commit([...rows, { id: nextId.current++, key: '', value: newEntryValue(values, root) }]);
  };
  const removeRow = (id: number): void => {
    commit(rows.filter((row) => row.id !== id));
  };

  const { blankRowIds, duplicateRowIds } = analyzeRows(rows);
  const summary = keyFaultSummary(blankRowIds.size, duplicateRowIds.size);

  return (
    <FieldGroup heading={heading} description={description} error={error} atRoot={false}>
      {rows.length === 0 ? <span className="tai-field-hint">No entries</span> : null}
      {summary !== undefined ? (
        <span role="alert" className="tai-field-error">
          {summary}
        </span>
      ) : null}
      {rows.map((row, index) => {
        const position = index + 1;
        const keyFault = rowKeyFault(row.id, blankRowIds, duplicateRowIds);
        const entryPath = path === '' ? row.key : `${path}.${row.key}`;
        const defaultField = (
          <FieldNode
            schema={values}
            root={root}
            value={row.value}
            onChange={(next) => {
              setValue(row.id, next);
            }}
            path={entryPath}
            label={undefined}
            required
            errors={errors}
            idPrefix={idPrefix}
          />
        );
        return (
          <div
            // The synthetic id keys the row (see the module note): keying by the
            // editable key or by index would remount the row as its key is typed.
            key={row.id}
            className="tai-row"
          >
            <Field label={`Key ${String(position)}`} error={keyFault}>
              <TextInput
                value={row.key}
                onChange={(event) => {
                  setKey(row.id, event.target.value);
                }}
              />
            </Field>
            <div style={{ flex: 1 }}>
              {renderEntry === undefined
                ? defaultField
                : renderEntry({
                    keyName: row.key,
                    path: entryPath,
                    valueSchema: values,
                    value: row.value,
                    onChange: (next) => {
                      setValue(row.id, next);
                    },
                    defaultField,
                  })}
            </div>
            <Button
              type="button"
              variant="secondary"
              aria-label={`Remove entry ${String(position)}`}
              onClick={() => {
                removeRow(row.id);
              }}
            >
              <CloseIcon />
              Remove
            </Button>
          </div>
        );
      })}
      <div>
        <Button type="button" variant="secondary" onClick={addRow}>
          Add entry
        </Button>
      </div>
    </FieldGroup>
  );
}

/** The inline key error for one row, or `undefined` when its key is fine. */
function rowKeyFault(
  id: number,
  blankRowIds: ReadonlySet<number>,
  duplicateRowIds: ReadonlySet<number>,
): string | undefined {
  if (blankRowIds.has(id)) return 'Key is required';
  if (duplicateRowIds.has(id)) return 'Duplicate key';
  return undefined;
}

/** A one-line summary of the map's key faults, or `undefined` when there are none. */
function keyFaultSummary(blankCount: number, duplicateCount: number): string | undefined {
  const parts: string[] = [];
  if (blankCount > 0) parts.push(`${String(blankCount)} entry with a blank key`);
  if (duplicateCount > 0) parts.push(`${String(duplicateCount)} entry with a duplicate key`);
  if (parts.length === 0) return undefined;
  return `${parts.join(' and ')} (not saved until fixed)`;
}

function newEntryValue(schema: JsonSchema, root: JsonSchema): unknown {
  const seeded = defaultValueForSchema(schema, root);
  if (seeded !== undefined) return seeded;
  const classified = classifySchema(schema, root);
  switch (classified.model.kind) {
    case 'string':
      return '';
    case 'boolean':
      return false;
    default:
      return undefined;
  }
}
