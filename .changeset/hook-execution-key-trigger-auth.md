---
'@tai42/api-client': minor
'@tai42/studio-sdk': minor
'@tai42/feature-hooks': minor
'@tai42/feature-settings': patch
---

Execution key on the hook and trigger-link forms, and the fire door surfaced on both
list surfaces. Every fire path RUNS AS an `execution_key` — the api-key `user_id`
whose live grants bound every tool call it makes — chosen on both forms from a shared
picker fed by the api-keys surface the settings tab already reads (the shared
`tokensPayloadKey` moves to the SDK, since two features now key it). The picker only
lists — the server decides, and its pass-role / token-free-evaluable refusals render
verbatim. Each option is labelled with the key's stable per-mint `key_fingerprint`,
which the server nests under `policy_data`; the picker offers one option per
`user_id`, since that is what a binding names. The `tokensPayload` schema now pins
`user_id` non-empty, so a key row with a blank id fails loudly at the transport edge
— in the settings API-keys tab as well as the picker — instead of rendering as a
blank row.

The fire DOOR is a server-derived, topic-level string
(`public` / `verifier` / `token` / `token+api_key` / `out-of-service`), NOT a
per-registration choice: `GET /api/hooks` reports it as a top-level `topic → door`
map (a hook's row reads its topic's door from that map), and each trigger-link record
carries its door as that same string enum. The hooks list shows each hook's door and
each trigger link its own, never a blank. A trigger link is inherently a token door;
the create dialog's one auth knob is an "Also require an api key" checkbox that rides
the create body as `require_api_key: boolean` (→ `token+api_key`). Registering a hook
carries no door field — a topic's door is configured through the Bind topic verifier
form and the server. The bind form's "replaces the current binding" notice does an
own-property lookup, so a topic named after an `Object.prototype` member no longer
reads as bound.

The create-link dialog's submit is no longer disabled on a blank topic or expiry —
it disables while the create is in flight, or while no execution key can be picked —
so "A topic is required." and "Choose an expiry." now render instead of leaving the
button silently dead.
