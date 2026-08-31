/**
 * The host's ONE injection of the Studio design system into `@tai42/jq-studio`.
 *
 * jq-studio renders its editor chrome through nine small UI primitives it looks up
 * from a React context (see its `PrimitivesProvider`); a host substitutes its own
 * design-system components for the built-ins so the visual jq editor paints in the
 * Studio look with no jq-studio dependency on that design system. This module maps
 * the SDK's nine primitives onto jq-studio's primitive contracts and mounts the
 * provider ONCE at the composition root, so every `JqField` — a host feature's or a
 * plugin page's — inherits it from the single shared jq-studio instance the SDK
 * carries. There is no per-site wiring: eight of the nine SDK primitives satisfy
 * jq-studio's contract directly and map as bare references (their prop surfaces
 * were cut from the same cloth). The ninth, `Badge`, is the one contract
 * TRANSLATION — jq-studio and the SDK label their tints with DIFFERENT variant
 * vocabularies (only `neutral` overlaps), so a bare reference would silently paint
 * jq-studio's `info` context chip neutral-gray. {@link JqBadge} translates the
 * vocabulary before rendering the SDK `Badge`; it is not a chrome wrapper, just the
 * word map the two contracts need to agree.
 */
import type { ComponentProps, ReactNode } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Select,
  TextInput,
  Textarea,
  Tooltip,
  PrimitivesProvider,
  type Primitives,
} from '@tai42/studio-sdk';

/**
 * The `Badge` primitive's prop shape as jq-studio hands it to the injected
 * component — jq-studio's own `BadgeProps` (a free-string `variant` plus
 * `children`), read off the `Primitives` contract so it can never drift from it.
 */
type JqBadgeProps = ComponentProps<Primitives['Badge']>;

/**
 * jq-studio's `Badge` variant vocabulary → the SDK `Badge`'s. jq-studio names its
 * tints `err | info | neutral | ok | warn`; the SDK `Badge` understands
 * `neutral | primary | success | warning | danger`. Only `neutral` is shared, so
 * every other jq-studio variant handed to the SDK `Badge` bare would miss its
 * `VARIANT_CLASS` and fall back to neutral-gray — jq-studio's `info` context chip
 * ("in: <shape>") the loudest casualty. This table maps each jq-studio variant to
 * the SDK tint that means the same thing:
 *
 *   info → primary   ok → success   warn → warning   err → danger   neutral → neutral
 *
 * Any variant not in the table (including the SDK-native names jq-studio's own
 * built-ins already use, e.g. `success`/`warning`/`danger`/`primary`) passes
 * through unchanged, so a bare SDK-vocabulary variant is left untranslated and an
 * unknown one still reaches the SDK's own neutral fallback.
 */
const BADGE_VARIANT_MAP: Record<string, string> = {
  info: 'primary',
  ok: 'success',
  warn: 'warning',
  err: 'danger',
  neutral: 'neutral',
};

/**
 * The SDK `Badge` under jq-studio's variant vocabulary: translate the variant (see
 * {@link BADGE_VARIANT_MAP}), then render the SDK `Badge`. This is contract
 * translation — a word map so the two Badge contracts agree on tints — not a chrome
 * wrapper (no markup, no styling of its own). Exported so the vocabulary map is
 * unit-tested directly.
 */
export function JqBadge({ variant, children }: JqBadgeProps): ReactNode {
  const mapped = variant === undefined ? undefined : (BADGE_VARIANT_MAP[variant] ?? variant);
  return <Badge variant={mapped}>{children}</Badge>;
}

/**
 * The SDK design-system components, mapped onto jq-studio's nine primitive
 * contracts. Eight are bare references: each SDK primitive satisfies the
 * corresponding jq-studio prop shape directly — same variants, same event/attribute
 * surface. (`ConfirmDialog` carries an extra optional `disabledNote` the SDK adds;
 * jq-studio ignores props it does not read, so the superset is compatible.) The
 * ninth, `Badge`, is the one VOCABULARY TRANSLATION: {@link JqBadge} maps
 * jq-studio's tint variant names onto the SDK's before rendering the SDK `Badge`.
 */
const STUDIO_PRIMITIVES: Partial<Primitives> = {
  Button,
  TextInput,
  Textarea,
  Select,
  Checkbox,
  Tooltip,
  Dialog,
  ConfirmDialog,
  Badge: JqBadge,
};

/**
 * Mounts jq-studio's `PrimitivesProvider` with the Studio design system, once,
 * above the whole routed tree. React is the import-map singleton every bundle
 * shares, so this one provider reaches both host feature `JqField` sites and
 * plugin-page ones.
 */
export function JqPrimitivesProvider({ children }: { children: ReactNode }): ReactNode {
  return <PrimitivesProvider primitives={STUDIO_PRIMITIVES}>{children}</PrimitivesProvider>;
}
