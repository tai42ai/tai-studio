/**
 * The mirror pin. `ExpressionFieldProps` and `ExpressionInputShape` restate the
 * subset of jq-studio's field props and input-shape descriptor that the schema
 * form actually passes, WITHOUT importing them — that is what keeps the form's
 * graph (and its emitted declarations) free of jq. A mirror can drift, so this
 * assignment is the compile-time proof that jq-studio's `JqField` still satisfies
 * the injection contract every host wires it into.
 *
 * It lives in a TEST because that is the only place the SDK may name
 * `@tai42/jq-studio` at all — it is a devDependency here, never a runtime one, and
 * a source module importing it would put the door (and its worker and wasm) back
 * in every consumer's graph.
 */
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';

import { JqField } from '@tai42/jq-studio';
import type { ExpressionFieldComponent } from './context';

describe('the injected expression-field contract', () => {
  it("is satisfied by jq-studio's JqField", () => {
    const door: ExpressionFieldComponent = JqField;

    // Key-existence pin: every contract prop must still EXIST on the real door's
    // props — structural assignability alone lets an optional prop silently
    // vanish from jq-studio while the form keeps passing it to nobody.
    type DoorProps = ComponentProps<typeof JqField>;
    type ContractKeys = keyof import('./context').ExpressionFieldProps;
    type MissingOnDoor = Exclude<ContractKeys, keyof DoorProps>;
    const _pin: MissingOnDoor extends never ? true : never = true;

    expect(_pin).toBe(true);
    expect(door).toBe(JqField);
  });
});
