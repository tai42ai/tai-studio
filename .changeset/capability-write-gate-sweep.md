---
'@tai42/studio-sdk': minor
'@tai42/feature-tools': minor
'@tai42/feature-agents': minor
---

Boundary-first capability gating. The shell seals the route boundary — the nav
already projects the caller's capabilities, and the routed content area now gates
the same way (a page whose token the projection does not cover renders a neutral
"not available" panel instead of a wall of reads the server would 403) — so the
per-control write gates that duplicated this across the admin/operator features are
no longer needed. What remains are the few write controls on REACHABLE pages worth
hiding before submit, each gated through one studio-sdk primitive:

`useCanWrite(path, method = 'POST')` — the fail-closed, method-aware boundary hook.
A control shows only once the caller's projection is ready AND reaches `method path`
(or for a full/admin projection); a not-ready projection keeps it hidden (fail
closed). It folds `coversWrite` behind a single hook call sites use in place of
reading the capability state directly.

The surviving gates:

- tools: the synchronous run (`POST /api/run-tool`) and background run
  (`POST /api/tool-runs`) each gate on their own door — a caller reaching neither
  sees a read-only note instead of dead run buttons.
- agents: the authoring Compose control gates on the preset-create door
  (`POST /api/presets`), and the authored-agent run gates on its authored-run door.

Full (admin / gate-off) projections are unchanged.
