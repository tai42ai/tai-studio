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
- `@tai42/studio-sdk/schema-form` — a jq-free `SchemaForm` entry for bundling
  consumers: importing it emits no jq editor, worker, or wasm. It imports no
  CSS by design — a subpath consumer loads `tokens.css` and `components.css`
  explicitly. Expression fields render as plain inputs unless the host injects
  a door (see `ExpressionFieldContext`).
- `@tai42/studio-sdk/testing` — test-only helpers: a registry reset and
  `installJsdomStubs()`, which fills the browser APIs jsdom omits.
- `@tai42/studio-sdk/tokens.css` — the design-token stylesheet. It also emits the
  canonical `@layer` order, so a host imports it FIRST.
- `@tai42/studio-sdk/fonts.css` — the self-hosted Inter Variable and Geist Mono
  Variable faces, loaded once per host app.
- `@tai42/studio-sdk/components.css` — the component, layout, responsive, and
  prose classes the design system is drawn with. It is **not class-only**: in the
  `tai-components` layer it also styles bare `h1`–`h6` (colour, size, weight,
  `letter-spacing`), `::selection`, Chromium's `input:-webkit-autofill`, and —
  below 640 px, so the mobile top bar cannot cover a jump target — `html`'s
  `scroll-padding-top` plus `scroll-margin-top` on `:target` and `#main-content`.
  It also declares one private custom property, `--shell-topbar-height`, on
  `:root`. All of it sits in `tai-components`, which outranks a host preflight in
  `base` — so a host that wants its OWN heading or selection rules to win has to
  place them after this sheet, not in `base`.

A host that bundles the SDK gets all three through the barrel's side-effect
imports. A host that consumes the SDK as an external module (the Studio shell
resolves it through the served import map) imports the three stylesheets itself.

## Browser support

The stylesheets ship as authored, with no build-time lowering, so the CSS they
use is the support floor: **Chrome/Edge 99, Firefox 97, Safari and iOS Safari
15.4**, set by `@layer` and `:focus-visible`. The same floor is declared in this
package's `browserslist`.

Theming deliberately does not use `light-dark()`. That function would fold each
light/dark pair onto one line, but it is invalid at computed-value time below
Chrome 123 / Firefox 120 / Safari 17.5 — and because every themed token would use
it, the whole palette would drop out at once below that line, leaving text on
text. Instead the dark value sits beside the light one under a `--tai-dark-` name
and is applied by a `prefers-color-scheme` query plus a `[data-theme="dark"]`
block, so each colour is still written exactly once. The Studio SHELL sits higher
than the SDK — it compiles Tailwind v4, whose output needs `@property` and
`color-mix()` — and declares that floor in the repository root's `browserslist`.

## Design tokens

`tokens.css` is the styling API: a plugin styles against these names and gets
whichever half the viewer's theme resolves to. The names are also exported as
`TOKEN_NAMES` (86 of them), and the list grows additively — a rename or a removal
bumps the SDK compatibility version.

The light value is the token; the dark value sits beside it under a
`--tai-dark-` name that a plugin never reads. Two blocks put the dark half into
service — a `prefers-color-scheme: dark` query for the OS preference and a
`[data-theme="dark"]` block for the viewer's explicit choice — and neither
carries a value of its own, so a pair cannot drift apart. A token whose dark
column reads _(same)_ below is either an alias of another token or deliberately
one value in both themes.

**The values below are the contract, and `tokens.css` is where they are
authored.** `token-usage.test.ts` pins them there in both directions: a kept name
given a new value and a token declared with a value nobody recorded fail alike.

**Grounds**

| Token                          | Light                      | Dark      |
| ------------------------------ | -------------------------- | --------- |
| `--tai-color-bg`               | `#ffffff`                  | `#0c0e12` |
| `--tai-color-surface`          | `#f9fafb`                  | `#12151b` |
| `--tai-color-surface-raised`   | `#ffffff`                  | `#171c24` |
| `--tai-color-surface-disabled` | `var(--tai-color-surface)` | _(same)_  |
| `--tai-color-code-bg`          | `#f3f4f6`                  | `#10131a` |

**Lines.** `border` and `border-strong` are decorative — both sit below 3:1 and
may never be a control's only boundary. `control-border` is the contrast-safe
one for inputs, checkboxes and secondary buttons.

| Token                         | Light                     | Dark      |
| ----------------------------- | ------------------------- | --------- |
| `--tai-color-border`          | `#e5e7eb`                 | `#262c36` |
| `--tai-color-border-strong`   | `#d1d5db`                 | `#39414e` |
| `--tai-color-control-border`  | `#767c85`                 | `#646c79` |
| `--tai-color-border-disabled` | `var(--tai-color-border)` | _(same)_  |

**Ink.** `decor` is the NON-TEXT tier — dividers, watermarks, decorative SVG
fill or stroke. It never appears on `color:` and never identifies a component or
a state.

| Token                       | Light                         | Dark                        |
| --------------------------- | ----------------------------- | --------------------------- |
| `--tai-color-text`          | `#111827`                     | `#e6e8ec`                   |
| `--tai-color-heading`       | `#000000`                     | `#ffffff`                   |
| `--tai-color-text-muted`    | `rgba(17, 24, 39, 0.62)`      | `rgba(230, 232, 236, 0.64)` |
| `--tai-color-text-disabled` | `rgba(17, 24, 39, 0.38)`      | `rgba(230, 232, 236, 0.36)` |
| `--tai-color-placeholder`   | `var(--tai-color-text-muted)` | _(same)_                    |
| `--tai-color-decor`         | `rgba(17, 24, 39, 0.44)`      | `rgba(230, 232, 236, 0.42)` |

**Accent.** The accent is brand, never status. `accent-on-tint` is accent TEXT
on `accent-tint`; `on-accent` is the label on an accent FILL.

| Token                        | Light                     | Dark                       |
| ---------------------------- | ------------------------- | -------------------------- |
| `--tai-color-accent`         | `#dc143c`                 | `#ed4c67`                  |
| `--tai-color-accent-hover`   | `#800020`                 | `#f4718a`                  |
| `--tai-color-accent-on-tint` | `#be123c`                 | `#f4718a`                  |
| `--tai-color-on-accent`      | `#ffffff`                 | `#0c0e12`                  |
| `--tai-color-accent-tint`    | `rgba(220, 20, 60, 0.08)` | `rgba(237, 76, 103, 0.12)` |

**Semantic.** The `-text` members are the only ones legible as text, dots or
icons; the `-fill` members are for fills and charts and carry `on-fill` ink.

| Token                   | Light                     | Dark                        |
| ----------------------- | ------------------------- | --------------------------- |
| `--tai-color-ok-text`   | `#047857`                 | `#34d399`                   |
| `--tai-color-err-text`  | `#b91c1c`                 | `#f87171`                   |
| `--tai-color-warn-text` | `#92400e`                 | `#fbbf24`                   |
| `--tai-color-ok-fill`   | `#10b981`                 | `#34d399`                   |
| `--tai-color-err-fill`  | `#ef4444`                 | `#f87171`                   |
| `--tai-color-warn-fill` | `#d97706`                 | `#fbbf24`                   |
| `--tai-color-ok-tint`   | `rgba(16, 185, 129, 0.1)` | `rgba(52, 211, 153, 0.12)`  |
| `--tai-color-err-tint`  | `rgba(239, 68, 68, 0.1)`  | `rgba(248, 113, 113, 0.12)` |
| `--tai-color-warn-tint` | `rgba(217, 119, 6, 0.1)`  | `rgba(251, 191, 36, 0.12)`  |
| `--tai-color-on-fill`   | `#0c0e12`                 | _(same)_                    |

**Focus, overlay, prose and syntax**

| Token                          | Light                         | Dark                 |
| ------------------------------ | ----------------------------- | -------------------- |
| `--tai-color-focus-ring`       | `var(--tai-color-accent)`     | _(same)_             |
| `--tai-color-scrim`            | `rgba(0, 0, 0, 0.45)`         | `rgba(0, 0, 0, 0.6)` |
| `--tai-color-prose-link`       | `#dc143c`                     | `#f4718a`            |
| `--tai-color-prose-link-hover` | `#800020`                     | `#ed4c67`            |
| `--tai-color-syntax-key`       | `var(--tai-color-text-muted)` | _(same)_             |
| `--tai-color-syntax-string`    | `var(--tai-color-ok-text)`    | _(same)_             |
| `--tai-color-syntax-number`    | `var(--tai-color-accent)`     | _(same)_             |
| `--tai-color-syntax-bool`      | `var(--tai-color-warn-text)`  | _(same)_             |

**Legacy slots.** The names a plugin already styles against, re-pointed at the
members of the contract above that keep them legible.

| Token                        | Light                        | Dark      |
| ---------------------------- | ---------------------------- | --------- |
| `--tai-color-primary`        | `var(--tai-color-accent)`    | _(same)_  |
| `--tai-color-primary-text`   | `var(--tai-color-on-accent)` | _(same)_  |
| `--tai-color-danger`         | `var(--tai-color-err-text)`  | _(same)_  |
| `--tai-color-danger-text`    | `#ffffff`                    | `#0c0e12` |
| `--tai-color-danger-hover`   | `#7f1d1d`                    | `#fca5a5` |
| `--tai-color-danger-surface` | `var(--tai-color-err-tint)`  | _(same)_  |
| `--tai-color-success`        | `var(--tai-color-ok-text)`   | _(same)_  |
| `--tai-color-warning`        | `var(--tai-color-warn-text)` | _(same)_  |

**Spacing** (n × 4; there is deliberately no `space-7`). Authored in `rem` so a
viewer's font-size preference scales them; the px column is the rendered size at
a 16 px root.

| Token           | Value     | at 16px |
| --------------- | --------- | ------- |
| `--tai-space-1` | `0.25rem` | 4px     |
| `--tai-space-2` | `0.5rem`  | 8px     |
| `--tai-space-3` | `0.75rem` | 12px    |
| `--tai-space-4` | `1rem`    | 16px    |
| `--tai-space-5` | `1.25rem` | 20px    |
| `--tai-space-6` | `1.5rem`  | 24px    |
| `--tai-space-8` | `2rem`    | 32px    |

**Type.** Line-height and weight are deliberately NOT in the tokens — the
component classes own them, so a `font:` shorthand never resets them.

| Token                | Value                                                                                       | at 16px                                 |
| -------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------- |
| `--tai-font-sans`    | `'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | —                                       |
| `--tai-font-mono`    | `'Geist Mono Variable', ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace`        | —                                       |
| `--tai-text-display` | `1.625rem`                                                                                  | 26px — KPI numbers                      |
| `--tai-text-xl`      | `1.4375rem`                                                                                 | 23px — page title                       |
| `--tai-text-section` | `1.0625rem`                                                                                 | 17px — section heading                  |
| `--tai-text-lg`      | `0.9375rem`                                                                                 | 15px — card title                       |
| `--tai-text-md`      | `0.84375rem`                                                                                | 13.5px — body                           |
| `--tai-text-sm`      | `0.78125rem`                                                                                | 12.5px — secondary                      |
| `--tai-text-code`    | `0.75rem`                                                                                   | 12px — mono blocks                      |
| `--tai-text-xs`      | `0.6875rem`                                                                                 | 11px — labels, badges, axes (the floor) |

**Radius, control geometry and motion.** Under `prefers-reduced-motion` both
motion durations resolve to `0ms`, so CSS written against them honours the
preference without reading the media query.

| Token                         | Value   |
| ----------------------------- | ------- |
| `--tai-radius-sm`             | `4px`   |
| `--tai-radius-code`           | `6px`   |
| `--tai-radius-md`             | `8px`   |
| `--tai-radius-tile`           | `10px`  |
| `--tai-radius-lg`             | `12px`  |
| `--tai-radius-overlay`        | `14px`  |
| `--tai-radius-full`           | `999px` |
| `--tai-control-height`        | `36px`  |
| `--tai-control-height-coarse` | `44px`  |
| `--tai-motion-fast`           | `150ms` |
| `--tai-motion-base`           | `250ms` |

**Elevation.** Only the shadow COLOUR varies by theme; the geometry is written
once, so a dark override cannot silently move an offset or a blur. `shadow-sm`
and `shadow-md` are legacy slots that now alias the lift and overlay geometry.

| Token                        | Light                                         | Dark                |
| ---------------------------- | --------------------------------------------- | ------------------- |
| `--tai-shadow-lift-color`    | `rgb(0 0 0 / 0.08)`                           | `rgb(0 0 0 / 0.45)` |
| `--tai-shadow-overlay-color` | `rgb(0 0 0 / 0.16)`                           | `rgb(0 0 0 / 0.6)`  |
| `--tai-shadow-lift`          | `0 12px 32px var(--tai-shadow-lift-color)`    | _(same)_            |
| `--tai-shadow-overlay`       | `0 24px 48px var(--tai-shadow-overlay-color)` | _(same)_            |
| `--tai-shadow-sm`            | `var(--tai-shadow-lift)`                      | _(same)_            |
| `--tai-shadow-md`            | `var(--tai-shadow-overlay)`                   | _(same)_            |

**Stacking.** `popover` and `tooltip` sit ABOVE the modal layers on purpose: both
portal to the document body as siblings of a dialog and have to clear its scrim
to be usable. `dropdown` is the rung reserved for an in-flow menu surface —
nothing in the SDK is on it, so a plugin's own menu has a rung to sit on instead
of inventing a number.

| Token              | Value |
| ------------------ | ----- |
| `--tai-z-sticky`   | `10`  |
| `--tai-z-dropdown` | `20`  |
| `--tai-z-overlay`  | `30`  |
| `--tai-z-dialog`   | `40`  |
| `--tai-z-popover`  | `45`  |
| `--tai-z-tooltip`  | `50`  |

## The shell classes

`components.css` also publishes the application-shell chrome, so a host can lay
out its own sidebar, brand lockup and top bar on the same geometry the Studio
uses. These classes are CSS only — the SDK ships no shell component, and the host
owns the markup.

| Class                             | What it is                                                                                               |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `.tai-shell`                      | The two-column grid: a sidebar track plus `minmax(0, 1fr)` for the page.                                 |
| `.tai-shell-sidebar`              | The sticky, full-height, scrollable nav column.                                                          |
| `.tai-shell-main`                 | The page track (`min-width: 0`, so a wide child scrolls itself instead of the document).                 |
| `.tai-brand`                      | The brand lockup, a link home; sits in the tab order ahead of the nav and carries the shared focus ring. |
| `.tai-brand-mark`                 | The 24 px mark inside it.                                                                                |
| `.tai-brand-label`                | Its wordmark; hidden in the icon rail.                                                                   |
| `.tai-nav-item` / `.tai-nav-link` | One nav row. Two names for the same rule.                                                                |
| `.tai-nav-section-header`         | The uppercase mono heading over a nav group; hidden in the icon rail.                                    |
| `.tai-topbar`                     | The sticky bar shown INSTEAD of the sidebar below 640 px.                                                |
| `.tai-skip-link`                  | Skip-to-content: off-screen until focused.                                                               |

**Geometry.** A 232 px sidebar at 1024 px and up; a 72 px icon rail from 640 px
that KEEPS a short text label under each icon (a touch band is never
tooltip-only); below 640 px the sidebar is `display: none` and `.tai-topbar`
becomes a sticky 56 px bar.

**Host prerequisites** — the shell classes assume all of these, and none of them
is something the sheet can supply for you:

1. **Import order.** `tokens.css` first (it emits the canonical `@layer` order),
   then `components.css`. A host preflight that resets borders and heading
   typography must be in the `base` layer, which sorts before them.
2. **A height to fill.** `.tai-shell` is `min-height: 100%`, so `html` and `body`
   need a height for it to reach the viewport. The sidebar sets its own
   `100dvh` (with a `100vh` fallback for browsers below the `dvh` floor).
3. **No clipping ancestor.** `.tai-shell-sidebar` is `position: sticky; top: 0` —
   an ancestor with `overflow` other than `visible` silently un-sticks it.
4. **`aria-current="page"` on the current nav row.** All three current-item cues
   (the accent tint, the accent-on-tint ink, the inset rail) key off that
   attribute, not off a class, so assistive tech and the rendering cannot
   disagree.
5. **The skip link is first.** `.tai-skip-link` has to be the first focusable
   element in the shell and to target the main region, or WCAG 2.4.1 is not met
   by rendering it. Below 640 px the sheet reserves the top bar's height with
   `scroll-padding-top`, and gives `:target` and `#main-content` a matching
   `scroll-margin-top` — so the main region wants `id="main-content"`.
6. **A nav surface below 640 px.** The sidebar is hidden there and the sheet
   styles the bar, not what opens from it. Below 640 px a host that renders
   `.tai-topbar` and nothing else has NO reachable navigation — the sheet cannot
   supply one. The SDK exports `Drawer` (with the `.tai-drawer` rules already in
   this sheet) as the intended vehicle, but nothing in the SDK mounts it: the
   host renders it and drives its `open` state itself.
7. **Nav icons carry no margin of their own.** `.tai-nav-item` is a flex row and
   already sets the icon-to-label gap from the spacing scale; a margin beside the
   icon is additive and sets that row apart from every other one.
8. **The rail rules are scoped.** The 72 px band's rules apply to
   `.tai-shell-sidebar` DESCENDANTS, so a host that lays its sidebar out itself
   keeps the full-width nav rendering at every width instead of getting
   column-stacked 11 px labels.
9. **`--shell-topbar-height` is private to the sheet**, deliberately outside the
   `--tai-*` contract. Do not read it; it is not part of the published API.

## Usage

```ts
import type { PluginEntry } from '@tai42/studio-sdk';

export const register: PluginEntry = (ctx) => {
  ctx.registerPage({ path: 'dashboard', title: 'Dashboard', component: MyDashboard });
};
```

## License

Apache-2.0. See the repository `LICENSE`.
