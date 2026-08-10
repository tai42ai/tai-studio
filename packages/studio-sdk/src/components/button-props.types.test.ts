/**
 * PUBLISHED-TYPE GATE for `ButtonProps`.
 *
 * `ButtonProps` is re-exported from the package entry, so it is plugin API and
 * the SDK surface is ADDITIVE ONLY. It was once narrowed from an interface to a
 * union of an action arm and an anchor arm, which broke two things every prior
 * consumer could do:
 *
 *   - `interface MyButton extends ButtonProps {}` → TS2312, "an interface can
 *     only extend an object type or intersection of object types with statically
 *     known members".
 *   - handing a `ButtonProps` value to a slot typed `ButtonHTMLAttributes<
 *     HTMLButtonElement>` → TS2322, because the anchor arm's `type` is `string`.
 *
 * A third spelling narrows it just as effectively: `href?: undefined` declared on
 * `ButtonProps` to discriminate the action form from the link form makes
 * `interface MyButton extends ButtonProps { href: string }` a TS2430,
 * "incorrectly extends" — so that discriminant belongs on `Button`'s own
 * parameter type, not on the published interface.
 *
 * The assertions below are TYPE-level and are enforced by `pnpm typecheck`
 * (`tsc --noEmit -p tsconfig.json` covers every file under `src`, tests
 * included). They deliberately do NOT use `expectTypeOf`, which vitest only
 * evaluates under `--typecheck` and would therefore be a gate that cannot fail.
 * The `it` blocks keep the same bindings live at runtime under `vitest run`.
 *
 * The types are imported from `../index`, the published entry, so dropping the
 * re-export fails this gate too.
 */
import type { ButtonHTMLAttributes } from 'react';
import { describe, expect, it } from 'vitest';

import type { ButtonProps, LinkButtonProps } from '../index';

/**
 * Non-distributive on purpose: `T extends U` would distribute over a union and
 * collapse to `boolean`, which `true` still satisfies — the gate would pass on
 * exactly the regression it exists to catch.
 */
type IsAssignable<T, U> = [T] extends [U] ? true : false;

/** GATE 1 — `ButtonProps` is an interface a plugin can extend. A union is TS2312. */
interface PluginButtonProps extends ButtonProps {
  readonly tone: 'quiet' | 'loud';
}

/** GATE 2 — a `ButtonProps` value fits a plain button-attribute slot. An anchor arm is TS2322. */
const buttonPropsFitButtonAttributes: IsAssignable<
  ButtonProps,
  ButtonHTMLAttributes<HTMLButtonElement>
> = true;

/** GATE 3 — the link form is still its own extendable interface carrying anchor attributes. */
interface PluginLinkButtonProps extends LinkButtonProps {
  readonly tone: 'quiet' | 'loud';
}

/**
 * GATE 4 — an extender may declare a member `ButtonProps` does not, `href`
 * included. A `href?: undefined` on `ButtonProps` is TS2430 here.
 */
interface PluginHrefButtonProps extends ButtonProps {
  readonly href: string;
}

describe('ButtonProps stays a compatible published type', () => {
  it('is an interface a plugin can extend', () => {
    const plugin: PluginButtonProps = { tone: 'loud', variant: 'primary', type: 'submit' };
    expect(plugin).toEqual({ tone: 'loud', variant: 'primary', type: 'submit' });
  });

  it('is assignable to ButtonHTMLAttributes<HTMLButtonElement>', () => {
    const action: ButtonProps = { variant: 'danger', type: 'reset', disabled: true };
    const attributes: ButtonHTMLAttributes<HTMLButtonElement> = action;
    expect(attributes.type).toBe('reset');
    expect(buttonPropsFitButtonAttributes).toBe(true);
  });

  it('keeps every baseline variant plus the added one', () => {
    const variants: readonly ButtonProps['variant'][] = [
      'primary',
      'secondary',
      'danger',
      'ghost',
      undefined,
    ];
    expect(variants).toHaveLength(5);
  });

  it('lets an extender declare its own href', () => {
    // The action/link discriminant is `Button`'s to hold, not the published
    // interface's: a downstream `interface MyButton extends ButtonProps { href:
    // string }` compiles, and the plugin decides what its own href means.
    const plugin: PluginHrefButtonProps = { href: '/agents', type: 'button' };
    expect(plugin.href).toBe('/agents');
  });

  it('offers the link form as a separate extendable interface', () => {
    const link: PluginLinkButtonProps = {
      tone: 'quiet',
      href: 'https://example.com',
      target: '_blank',
    };
    expect(link.href).toBe('https://example.com');
  });
});
