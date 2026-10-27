/** The form-view list of MCP entries: managed + installed entries render read-only,
 *  hand-authored entries editable, plus the Add server affordance. */
import type { Extension, McpEnvRef } from '@tai42/api-client';
import type { JsonSchema, ToolListQuery } from '@tai42/studio-sdk';
import { Button, defaultValueForSchema, EmptyState, NoFiniteValueError } from '@tai42/studio-sdk';
import { type ReactNode, useState } from 'react';

import { asRecord, connectorRefOf, STRIPPED_FIELDS, stripSchemaFields } from './mcp-config-parse';
import { EditableEntryCard, InstalledEntryCard, ManagedEntryCard } from './mcp-entry-cards';
import { type BoundToolsRead, serverToolsQuery } from './mcp-tool-list-editor';

export function EntryList({
  schema,
  entries,
  discoveredTools,
  extensions,
  extensionsError,
  availableSecretKeys,
  keyPickingAvailable,
  dirty,
  secretStoreBlockedReason,
  installedMcpRefs,
  refsByTitle,
  onPasteSecret,
  onChange,
}: {
  readonly schema: JsonSchema;
  readonly entries: readonly unknown[];
  readonly discoveredTools: BoundToolsRead;
  readonly extensions: readonly Extension[];
  readonly extensionsError: string | undefined;
  readonly availableSecretKeys: readonly string[];
  readonly keyPickingAvailable: boolean;
  readonly dirty: boolean;
  readonly secretStoreBlockedReason: string | undefined;
  // title → installed listing ref (`namespace/name`) for installer-written entries.
  readonly installedMcpRefs: ReadonlyMap<string, string>;
  // title → its `!ENV` marker refs, keyed off the SAVED manifest's entry titles.
  readonly refsByTitle: ReadonlyMap<string, readonly McpEnvRef[]>;
  readonly onPasteSecret: (manifestPointer: string, keyHint: string, secret: string) => void;
  readonly onChange: (entries: unknown[]) => void;
}): ReactNode {
  const formSchema = stripSchemaFields(schema, STRIPPED_FIELDS);
  // The marker checklist reflects SAVED server state and is keyed by title (stable
  // identity), so it survives a working-list reorder that would drift an index.
  const refsFor = (entry: unknown): readonly McpEnvRef[] => {
    const title = asRecord(entry).title;
    return typeof title === 'string' ? (refsByTitle.get(title) ?? []) : [];
  };
  const installedRefFor = (entry: unknown): string | undefined => {
    const title = asRecord(entry).title;
    return typeof title === 'string' ? installedMcpRefs.get(title) : undefined;
  };
  const setEntry = (index: number, next: unknown): void => {
    onChange(entries.map((entry, position) => (position === index ? next : entry)));
  };
  const removeEntry = (index: number): void => {
    onChange(entries.filter((_, position) => position !== index));
  };
  // An entry schema that admits no finite value has no entry to add: Add server says
  // so under the button, for as long as that schema is the one in use. Any other error
  // propagates.
  const [addFailure, setAddFailure] = useState<{ schema: JsonSchema; message: string }>();
  const addEntry = (): void => {
    let seeded: unknown;
    try {
      seeded = defaultValueForSchema(formSchema);
    } catch (error) {
      if (!(error instanceof NoFiniteValueError)) throw error;
      console.error('A server cannot be added', error);
      setAddFailure({ schema, message: `A server cannot be added: ${error.message}` });
      return;
    }
    setAddFailure(undefined);
    onChange([...entries, seeded]);
  };

  const toolsFor = (entry: unknown): ToolListQuery => {
    const title = asRecord(entry).title;
    return serverToolsQuery(discoveredTools, typeof title === 'string' ? title : undefined);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      {entries.length === 0 ? (
        <EmptyState
          title="No MCP servers configured"
          description="Add a server, fill in its details, then save."
        />
      ) : null}
      {entries.map((entry, index) => {
        const managed = connectorRefOf(entry);
        // Index keys are correct here: entries have no stable identity and the whole
        // list is one controlled value re-rendered on every edit.
        if (managed !== null) {
          return <ManagedEntryCard key={index} entry={entry} index={index} managed={managed} />;
        }
        // A title matching an installed mcp-server item name IS that install
        // (the installer refuses title collisions): render it read-only so hand
        // edits cannot clobber an entry the installer owns.
        const installedRef = installedRefFor(entry);
        if (installedRef !== undefined) {
          return (
            <InstalledEntryCard
              key={index}
              entry={entry}
              index={index}
              installedRef={installedRef}
              refs={refsFor(entry)}
            />
          );
        }
        return (
          <EditableEntryCard
            key={index}
            entry={entry}
            index={index}
            formSchema={formSchema}
            discoveredTools={toolsFor(entry)}
            extensions={extensions}
            extensionsError={extensionsError}
            availableSecretKeys={availableSecretKeys}
            keyPickingAvailable={keyPickingAvailable}
            dirty={dirty}
            secretStoreBlockedReason={secretStoreBlockedReason}
            refs={refsFor(entry)}
            onPasteSecret={onPasteSecret}
            onChange={(next) => {
              setEntry(index, next);
            }}
            onRemove={() => {
              removeEntry(index);
            }}
          />
        );
      })}
      <div>
        <Button type="button" variant="secondary" onClick={addEntry}>
          Add server
        </Button>
        {addFailure?.schema === schema ? (
          <p role="alert" className="tai-field-error">
            {addFailure.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
