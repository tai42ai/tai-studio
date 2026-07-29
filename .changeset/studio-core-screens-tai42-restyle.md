---
'@tai42/feature-tools': patch
'@tai42/feature-agents': patch
'@tai42/feature-observability': patch
'@tai42/feature-settings': patch
'@tai42/feature-marketplace': patch
---

Restyle the Studio core feature screens onto the tai42 design system. The tools,
agents, observability, settings, and marketplace packages now render through the
shared studio-sdk primitives and design tokens — `Page`/`PageHeader`, `Stack`,
`Card`, `ScrollRegion`, `useBreakpoint`, and the published `.tai-*` classes
(cards, master/detail split, nav rows, chips, KPI figures) — in place of inline
hex/px/box-shadow styles and legacy `--tai-color-*` tokens. No behaviour change.

Also corrects a pre-existing status-colour defect in tools: the background-run
"running" chip drew the crimson brand accent (`STATUS_VARIANT.running: 'primary'`),
now `'neutral'`, since crimson is the accent and never a status signal.
