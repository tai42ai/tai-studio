---
'@tai42/studio-sdk': minor
---

`useTheme` gains a three-state preference. Alongside the resolved
`theme: 'light' | 'dark'` it now publishes `preference: 'light' | 'dark' | 'system'`
and `setPreference`, and persists the explicit choice to `localStorage`
(written only when the operator sets it, never on boot). A `'system'` preference
follows `prefers-color-scheme` and tracks OS changes live. The `theme` union is
unchanged and every existing member (`theme`, `setTheme`, `toggle`) keeps its
shape, so the surface is additive.
