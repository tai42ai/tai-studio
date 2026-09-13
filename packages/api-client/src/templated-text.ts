import { z } from 'zod';

/**
 * One authored-text value: either inline `content` (text written in place) or a
 * stored template `id` (a template resource fetched and rendered), never both and
 * never neither. `kwargs` are the render parameters and apply in BOTH cases — a
 * prompt with placeholders needs its values whether it was typed inline or fetched.
 * `.strict()` refuses any other key so a drifting field fails the parse loudly.
 *
 * This is the target the generated served-document schemas map every platform
 * `x-tai42-templated-text` field to, so a body can never regenerate as a bare
 * `z.string()`. It lives in its own module because the generated module imports it,
 * and the generated module is imported back by `schemas.ts`.
 */
export const templatedText = z
  .object({
    content: z.string().optional(),
    id: z.string().optional(),
    kwargs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((value) => (value.content === undefined) !== (value.id === undefined), {
    message: 'A templated-text value sets exactly one of `content` or `id`.',
  });
export type TemplatedText = z.infer<typeof templatedText>;

/**
 * A templated-text value that must carry a source: inline `content` is non-empty, or
 * a stored template `id` is chosen. Used where the platform contract requires a
 * value (e.g. a state binding's subject, an update's adapter when present).
 */
export const requiredTemplatedText = templatedText.refine(
  (value) => (value.id !== undefined ? value.id.length > 0 : (value.content ?? '').length > 0),
  { message: 'Provide inline text or choose a stored template.' },
);
