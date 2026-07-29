---
'@tai42/feature-presets': patch
'@tai42/feature-extensions': patch
'@tai42/feature-templates': patch
'@tai42/feature-connectors': patch
'@tai42/feature-hooks': patch
'@tai42/feature-storage': patch
'@tai42/feature-scheduling': patch
'@tai42/feature-interactions': patch
'@tai42/feature-notifications': patch
'@tai42/feature-manifest': patch
'@tai42/feature-system': patch
---

Restyle the eleven long-tail Studio feature screens onto the design system.

Each page adopts the SDK `PageHeader` (a nav-section eyebrow above the `<h1>`,
whose accessible name is unchanged) and the `Stack` layout primitive in place of a
hand-rolled heading block and flex column. `font:` shorthands over a text token —
which reset line-height — are replaced by the `.tai-card-title` /
`.tai-section-title` / `.tai-mono` classes or split `fontSize`/`fontFamily`
declarations. The presets and templates master/detail surfaces move onto the
`.tai-split` classes: two panes from 1024 px up, one pane at a time below it
(driven by `useBreakpoint`) with a "Back" control that clears the existing
selection search param. Data-heavy screens lead with their status/summary before
detail, and tables keep the primary identifier first (mono) with numerics
right-aligned in tabular figures. No API call, query, route, or interaction
behaviour changes.
