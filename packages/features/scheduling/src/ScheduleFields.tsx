/**
 * The top fields of the add-schedule dialog: the schedule name, the tool picker
 * (which draws the schedulable-tools read's states), and the tool-kwargs JSON textarea.
 */
import { Field, Textarea, TextInput, type ToolListQuery, ToolPicker } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

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
  readonly toolsQuery: ToolListQuery;
  readonly excludeToolNames: readonly string[];
  readonly displayNames: Readonly<Record<string, string>>;
  readonly badgesByTool: Readonly<Record<string, readonly string[]>>;
}): ReactNode {
  // The read serves no schedulable tool at all, versus every one it serves is hidden.
  const nothingSchedulable = toolsQuery.isSuccess && (toolsQuery.data?.length ?? 0) === 0;
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

      <ToolPicker
        query={toolsQuery}
        value={tool}
        onChange={setTool}
        label="Tool"
        description={
          nothingSchedulable
            ? "A tool can be scheduled when it carries the scheduling backend's schedule extension."
            : undefined
        }
        error={submitted && toolMissing ? 'A tool is required.' : undefined}
        emptyNote={
          nothingSchedulable
            ? 'No tool can be scheduled.'
            : 'No tool to schedule. Hidden tools are not offered.'
        }
        excludeNames={excludeToolNames}
        displayNames={displayNames}
        badgesByTool={badgesByTool}
      />

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
