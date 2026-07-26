# @tai42/studio-sdk

The Studio plugin surface: everything a Studio plugin (and every built-in
feature) is allowed to touch. It defines the plugin API a plugin implements — the
`PluginContext` its `register` entry receives, the contribution types, and the
version-compatibility gate — and ships the shared design-system components,
hooks, and schema-driven auto-form that features and plugins build on.

The host-only registry (`loadPlugin`/`getContributions`) is deliberately absent
from the main entry so a served plugin asset cannot forge, wipe, or enumerate the
registry; it lives only behind the `@tai42/studio-sdk/host` entry that the host
bundle imports. See the repository `SECURITY.md` for the trust boundary.

## Install

```bash
pnpm add @tai42/studio-sdk
```

## Entry points

- `@tai42/studio-sdk` — the plugin API, design system, and hooks.
- `@tai42/studio-sdk/host` — the host-only plugin registry.
- `@tai42/studio-sdk/testing` — test-only helpers: a registry reset and
  `installJsdomStubs()`, which fills the browser APIs jsdom omits.
- `@tai42/studio-sdk/tokens.css` — the design-token stylesheet. It also emits the
  canonical `@layer` order, so a host imports it FIRST.
- `@tai42/studio-sdk/fonts.css` — the self-hosted Inter Variable and Geist Mono
  Variable faces, loaded once per host app.
- `@tai42/studio-sdk/components.css` — the component, layout, responsive, and
  prose classes the design system is drawn with.

A host that bundles the SDK gets all three through the barrel's side-effect
imports. A host that consumes the SDK as an external module (the Studio shell
resolves it through the served import map) imports the three stylesheets itself.

## Browser support

The stylesheets ship as authored, with no build-time lowering, so the CSS they
use is the support floor: **Chrome/Edge 123, Firefox 120, Safari and iOS Safari
17.5**. It is set by `light-dark()`, which is how every themed token carries its
light and dark value in one place. The same floor is declared in this package's
`browserslist`. Below it the tokens do not degrade gracefully — they stop
resolving — so a host that must serve older browsers needs to lower the token
stylesheet itself.

## Usage

```ts
import type { PluginEntry } from '@tai42/studio-sdk';

export const register: PluginEntry = (ctx) => {
  ctx.registerPage({ path: 'dashboard', title: 'Dashboard', component: MyDashboard });
};
```

## License

Apache-2.0. See the repository `LICENSE`.
