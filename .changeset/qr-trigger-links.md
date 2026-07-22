---
'@tai42/api-client': minor
'@tai42/feature-hooks': minor
---

QR trigger links on the hooks page. A trigger link is a minted, token-bearing public
URL (`GET|POST /trigger/{token}`) that fires a hook topic — a scannable QR on a wall,
sticker, or slide. The api-client gains `createTriggerLink` / `listTriggerLinks` /
`deleteTriggerLink` with their zod schemas, and exposes its configured `baseUrl`
(read-only) so a feature can compose the ABSOLUTE trigger URL against the API origin
(a same-origin deployment falls back to the page origin). The hooks feature gains a
trigger-links section: a table (name, topic, expiry, a per-link params indicator, hash
prefix, revoke-behind-confirm) and a create flow ending in a QR dialog (`uqr` — a new
dependency of the hooks feature), with an explicit expiry picker (permanent / preset /
custom seconds, no default) and an optional per-link `tool_kwargs` JSON editor. The
section and its controls are capability-gated: hooks-granted callers see the list, and
the write-tier witness gates create + revoke so a read-only grantee sees no control
that would 403 on submit.
