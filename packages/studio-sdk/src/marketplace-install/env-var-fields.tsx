import type { ReactNode } from 'react';

import { Checkbox } from '../components/checkbox';
import { Field } from '../components/field';
import { TextInput } from '../components/inputs';

/**
 * One input + secret toggle per required env var, fully controlled. `requiredSecret`
 * is the server's per-var secret-ness: a `true` var (an OAuth client secret) is
 * LOCKED on — the server masks it regardless, so an off toggle would lie — while a
 * `false` var starts off and stays free. `hints` names the item that needs each var.
 */
export function EnvVarFields({
  requiredVars,
  values,
  secret,
  requiredSecret,
  hints,
  onChangeValue,
  onToggleSecret,
}: {
  readonly requiredVars: readonly string[];
  readonly values: Record<string, string>;
  readonly secret: Record<string, boolean>;
  readonly requiredSecret?: Record<string, boolean>;
  readonly hints?: Record<string, string>;
  readonly onChangeValue: (name: string, value: string) => void;
  readonly onToggleSecret: (name: string, checked: boolean) => void;
}): ReactNode {
  return (
    <>
      {requiredVars.map((name) => {
        const locked = requiredSecret?.[name] === true;
        const hint = hints?.[name];
        return (
          <div key={name} className="tai-stack tai-stack-2">
            <Field label={name}>
              <TextInput
                value={values[name] ?? ''}
                onChange={(event) => {
                  onChangeValue(name, event.currentTarget.value);
                }}
              />
            </Field>
            {hint !== undefined ? <span className="tai-muted">Required by {hint}</span> : null}
            <Checkbox
              checked={secret[name] === true}
              disabled={locked}
              onCheckedChange={(checked) => {
                onToggleSecret(name, checked);
              }}
              label="Store as secret"
            />
          </div>
        );
      })}
    </>
  );
}
