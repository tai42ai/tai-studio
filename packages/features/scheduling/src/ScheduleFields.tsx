/**
 * The top fields of the add-schedule dialog: the schedule name, the tool picker
 * (with its list-error branch), and the tool-kwargs JSON textarea.
 */
import {
  errorMessage,
  ErrorState,
  Field,
  Textarea,
  TextInput,
  ToolPicker,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

/** The minimal tools-list query shape this surface reads. */
interface ToolsQueryLike {
  readonly data: readonly string[] | undefined;
  readonly isError: boolean;
  readonly isPending: boolean;
  readonly error: unknown;
  readonly refetch: () => unknown;
}

export function ScheduleFields({
  name,
  setName,
  tool,
  setTool,
  kwargs,
  setKwargs,
  submitted,
  nameMissing,
  toolMissing,
  kwargsError,
  toolsQuery,
  excludeToolNames,
  displayNames,
  badgesByTool,
}: {
  readonly name: string;
  readonly setName: (value: string) => void;
  readonly tool: string | null;
  readonly setTool: (value: string) => void;
  readonly kwargs: string;
  readonly setKwargs: (value: string) => void;
  readonly submitted: boolean;
  readonly nameMissing: boolean;
  readonly toolMissing: boolean;
  readonly kwargsError: string | null;
  readonly toolsQuery: ToolsQueryLike;
  readonly excludeToolNames: readonly string[];
  readonly displayNames: Readonly<Record<string, string>>;
  readonly badgesByTool: Readonly<Record<string, readonly string[]>>;
}): ReactNode {
  return (
    <>
      <Field label="Name" error={submitted && nameMissing ? 'A name is required.' : undefined}>
        <TextInput
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder="nightly-report"
        />
      </Field>

      {toolsQuery.isError ? (
        <ErrorState
          message={errorMessage(toolsQuery.error)}
          onRetry={() => void toolsQuery.refetch()}
        />
      ) : (
        <Field label="Tool" error={submitted && toolMissing ? 'A tool is required.' : undefined}>
          <ToolPicker
            toolNames={toolsQuery.data ?? []}
            value={tool}
            onChange={setTool}
            disabled={toolsQuery.isPending}
            placeholder={toolsQuery.isPending ? 'Loading tools…' : 'Select a tool…'}
            excludeNames={excludeToolNames}
            displayNames={displayNames}
            badgesByTool={badgesByTool}
          />
        </Field>
      )}

      <Field
        label="Tool kwargs (JSON)"
        description="A JSON object passed to the tool. Leave as {} for none."
        error={kwargsError ?? undefined}
      >
        <Textarea
          value={kwargs}
          onChange={(event) => {
            setKwargs(event.target.value);
          }}
          style={{ fontFamily: 'var(--tai-font-mono)', minHeight: '6rem' }}
        />
      </Field>
    </>
  );
}
