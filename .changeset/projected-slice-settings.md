---
'@tai42/feature-settings': minor
'@tai42/feature-tools': minor
'@tai42/feature-agents': minor
'@tai42/feature-interactions': patch
'@tai42/feature-notifications': patch
---

Projected-slice rendering across the feature surfaces: the tools and agents pages
filter their lists to the caller's capability projection when scoped (full
projections are unchanged). The tools run panel is not mounted for a deep-linked
tool outside the projection (it shows a "not available" state instead of a run
action the server would deny). The interactions and notifications inboxes gain a
scoped, per-identity empty-state.

The core Settings surface gates its sub-tabs by VISIBILITY: the Settings,
Environment, and Backup tabs render only when the caller's projection reaches their
backing read route (`/api/config` for Settings/Environment, `/api/backup` for
Backup); the API keys tab — a self-limited own-key surface — is always shown, and a
full projection shows every tab. The container's config-mode read (`/api/config/mode`)
is gated on that same `/api/config` coverage, so a scoped session that cannot reach
config skips the read and renders a conservative read-only default with no mode card
rather than letting a mode 403 wall the always-shown API keys tab. Each visible tab's
edit controls gate on the deployment `read_only` flag. Within the always-shown API
keys tab, the deployment-wide access-control mapper is itself gated by VISIBILITY: it
renders only for a caller whose projection reaches every admin read it mounts
(`/api/auth/routes`, `/api/auth/public-routes`, `/api/sub-mcp`) or a full projection,
so a scoped own-key caller sees only the keys table instead of a 403-walled mapper.

The tools extensions card no longer walls when its preset-tagging read
(`/api/presets`) is unreachable: a scoped tools-caller without presets access falls
through to the manifest editor path instead of a full-card error. The agents
authoring section degrades the same way — an unreachable authored-presets read
(`/api/presets`) is treated as "no authored presets" (its empty state) rather than
walling the reachable agents page, keeping the authorable-agents read the only
wall-worthy failure.

Settings API keys tab gains an owner column (read from `policy_data["owner_user_id"]`),
projection-aware mint gating (the create control is hidden for an owned key, for a
caller whose projection cannot reach the mint route via `useCanWrite`, or on a
non-mintable deployment, and the create dialog's scope picker is capped to the
projection's scopes), and plugin settings tabs are gated on their optional
`requiredCapabilities`. The minted-key dialog can turn a freshly minted key into a
one-time claim link rendered as a QR code (inline SVG) plus its absolute URL and
expiry, introducing a new `uqr` dependency for QR encoding.
