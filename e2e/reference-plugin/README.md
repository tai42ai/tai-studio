# reference-plugin

Reference [Studio](../../README.md) plugin for the tai-studio end-to-end suite.
It has two halves:

- **Tools** (`src/reference_plugin/tools.py`) — `studio_demo_echo`,
  `studio_demo_form`, and `studio_demo_fail`, registered with the skeleton via
  `@tai_app.tools.tool`.
- **Front-end** (`studio-src/`) — a Studio bundle built against `@tai42/studio-sdk`
  that exports a `register(context)` entry; the host calls it with a
  `PluginContext` through which the plugin contributes one page, one tool panel
  (for `studio_demo_echo`), and one sidebar nav entry linking to the page. The
  build emits `src/reference_plugin/studio/` (the bundle, its scoped stylesheet,
  and `studio-manifest.json` with sub-resource-integrity hashes for every emitted
  file), which the skeleton serves under its configured `studio_dist_path`.

## Styling contract

The bundle demonstrates both sanctioned styling paths:

- **SDK components + tokens.** Chrome is built from `@tai42/studio-sdk` components,
  and inline styles read the design-system tokens (`var(--tai-*)`).
- **A plugin-shipped scoped stylesheet** (`studio-src/styles.css`, imported from
  `index.tsx` so the build emits it). The host injects it as an SRI'd
  `<link rel="stylesheet">` — listed in the manifest `integrity` map as a `.css`
  asset — BEFORE the bundle's JS imports, so the styles are in the cascade before
  the page renders. It obeys three hard rules, which every plugin stylesheet must:
  1. **No global resets/preflight** — never style `html`, `body`, `:root`, `*`,
     or bare element selectors at top level.
  2. **Every selector is scoped under a plugin root class** the plugin renders
     itself, prefixed with the package name (`reference_plugin-`). No host-stamped
     wrapper enforces this — the contract plus this exemplar is the mechanism.
  3. **Theme values come from the SDK tokens** (`var(--tai-*)`), never hardcoded
     colors, so the stylesheet themes itself in light and dark with no logic of
     its own. Bundled third-party base CSS is exempt from rule 3, but rules 1–2
     still bind it.

Stylesheet injection is a HOST capability: a plugin that ships a `.css` asset
needs a Studio host that injects it. A deployment pairs the host and its plugins.

The e2e boot recipe installs this package, points the skeleton's manifest
`studio_plugins` at it, and drives the resulting UI with Playwright.
