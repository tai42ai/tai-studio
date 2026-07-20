---
'@tai42/api-client': minor
'@tai42/studio-sdk': minor
---

Capability projection foundation: api-client methods and zod schemas for the
skeleton's `/api/auth/me` projection, `/api/auth/claim-links`, `/api/login/claim`
(sharing the existing `loginResult` shape), and `/api/auth/logout`; plus a
studio-sdk `CapabilityProvider`/`useCapabilities` fetch state machine with the
`isFullProjection` and `coversAnyRoute` evaluators and an optional
`requiredCapabilities` gate on the plugin page, nav-entry, and settings-tab
contributions.
