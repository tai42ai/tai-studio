/**
 * FieldNode's memo invariant: editing one field re-renders only that field's
 * own subtree, never a sibling's — so the render work of a keystroke is bounded
 * and does not scale with the number of sibling fields on the form.
 *
 * Each field is rendered through an injected expression door (SchemaForm's real
 * host-injection seam, the same one `jq-door.test.tsx` drives). A door only
 * renders when its FieldNode subtree renders, so counting door renders per field
 * is the observable proxy for FieldNode renders: a sibling the `memo` skips never
 * re-renders its door. The test types into one field and asserts every sibling's
 * door stays at its mount count (0 further renders) while the edited field's grows
 * one render per character.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, StrictMode, useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ExpressionFieldProps } from './context';
import { SchemaForm } from './SchemaForm';
import type { JsonSchema } from './types';

/** Every door render, in order, tagged by the field label it rendered for. */
const renders: string[] = [];

beforeEach(() => {
  renders.length = 0;
});

/** The injected door double: records each render and edits through `onChange`. */
function DoorDouble(props: ExpressionFieldProps): ReactNode {
  renders.push(props.label);
  return (
    <textarea
      data-testid="expression-door"
      aria-label={props.label}
      value={props.value}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
    />
  );
}

function renderCount(label: string): number {
  return renders.filter((entry) => entry === label).length;
}

/** Eight sibling string fields, each an expression door, named phonetically. */
const FIELD_NAMES = [
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
] as const;

const EIGHT_FIELDS: JsonSchema = {
  type: 'object',
  properties: Object.fromEntries(
    FIELD_NAMES.map((name) => [
      name,
      { type: 'string', title: name, 'x-tai42-expression': { language: 'jq' } },
    ]),
  ),
  required: [...FIELD_NAMES],
};

/** A controlled form owning the emitted value, as a real caller does. */
function Harness(): ReactNode {
  const [value, setValue] = useState<unknown>({});
  return (
    <SchemaForm
      schema={EIGHT_FIELDS}
      value={value}
      onChange={setValue}
      expressionField={DoorDouble}
    />
  );
}

/** Characters typed into the one edited field. */
const TYPED = 'abcd';

/**
 * Type `TYPED` into the `alpha` field and assert the render bound: `alpha`'s door
 * renders once per character (twice under StrictMode's double-invoke) and every
 * other field's door does not render again at all. `strictFactor` is React's
 * per-render invoke count for the wrapping mode.
 */
async function assertOnlyEditedFieldRerenders(strictFactor: number): Promise<void> {
  const user = userEvent.setup({ delay: null });
  expect(await screen.findAllByTestId('expression-door')).toHaveLength(FIELD_NAMES.length);

  const baseline = new Map(FIELD_NAMES.map((name) => [name, renderCount(name)]));
  await user.type(screen.getByRole('textbox', { name: 'alpha' }), TYPED);

  for (const name of FIELD_NAMES) {
    const added = renderCount(name) - (baseline.get(name) ?? 0);
    if (name === 'alpha') {
      expect(added).toBe(TYPED.length * strictFactor);
    } else {
      expect(added).toBe(0);
    }
  }
}

describe('FieldNode — sibling render isolation', () => {
  it('re-renders only the edited field, leaving its siblings untouched', async () => {
    render(<Harness />);
    await assertOnlyEditedFieldRerenders(1);
  });

  it('re-renders only the edited field under StrictMode double-invoke', async () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    await assertOnlyEditedFieldRerenders(2);
  });
});
