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

- `@tai42/studio-sdk` — the plugin API, design system, hooks, and the
  schema-driven `SchemaForm`. It exports **no jq**: the visual jq editor is the
  separately published `@tai42/jq-studio`, which consumers import directly (see
  [Expression fields](#expression-fields)).
- `@tai42/studio-sdk/host` — the host-only plugin registry.
- `@tai42/studio-sdk/schema-form` — a form-only `SchemaForm` entry for bundling
  consumers that want the form without the barrel. It imports no CSS by design —
  a subpath consumer loads `tokens.css` and `components.css` explicitly.
- `@tai42/studio-sdk/testing` — test-only helpers: a registry reset,
  `installJsdomStubs()`, which fills the browser APIs jsdom omits, and
  `destructiveColorOffences()`, the destructive-emphasis rule below.
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

## Expression fields

A string field carrying the `x-tai42-expression` annotation authors through a
visual expression editor — but **only when the host injects one**. The SDK owns
the injection point and nothing else:

- `ExpressionFieldContext` — the ambient door for a whole tree.
- `SchemaForm`'s `expressionField` prop — the per-form door.
- `ExpressionFieldComponent` / `ExpressionFieldProps` / `ExpressionInputShape` —
  the door contract, which MIRRORS jq-studio's field props without importing
  them.

With no door, an annotated field renders the plain string input, and the SDK's
module graph reaches no jq at all — no editor, no Web Worker, no wasm.

The door itself is `JqField` from
[`@tai42/jq-studio`](https://www.npmjs.com/package/@tai42/jq-studio), imported
directly by whoever wants it:

```tsx
import { SchemaForm } from '@tai42/studio-sdk';
import { JqField } from '@tai42/jq-studio';

<SchemaForm schema={schema} value={value} onChange={onChange} expressionField={JqField} />;
```

A host that wants the editor everywhere mounts the door once at its root
(`ExpressionFieldContext.Provider`), injects its design system into the editor
once (`PrimitivesProvider` from `@tai42/jq-studio`), and installs the shared
evaluation worker once at boot (`installDefaultJqWorker()`).

**Singleton.** jq-studio holds a module-scoped React context and one shared
worker, so a deployment must resolve `@tai42/jq-studio` to ONE module. In the
Studio that is the served import map (`/vendor/jq-studio.js`), exactly as it
serves react and `@tai42/studio-sdk`; a second bundled copy would give a second
primitives context (the design-system injection silently falls back to the
built-ins), a second worker, and a duplicate multi-megabyte wasm.

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
`TOKEN_NAMES` (79 of them). A new name is not a break; a rename or a removal is a
breaking change that bumps `STUDIO_PLUGIN_API_VERSION`.

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
| `--tai-color-ok-text`   | `#065f46`                 | `#34d399`                   |
| `--tai-color-err-text`  | `#b91c1c`                 | `#fca5a5`                   |
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

**Destructive emphasis.** A fill for the destructive button only, never text:
error text takes `--tai-color-err-text`. It is a deep red that runs darker than
the brand accent in both themes, so a destructive control is never mistaken for
the primary one, with a white label and a hover a shade deeper. A plugin checks its
own styles against this rule with `destructiveColorOffences()` from
`@tai42/studio-sdk/testing`.

| Token                           | Light     | Dark      |
| ------------------------------- | --------- | --------- |
| `--tai-color-destructive`       | `#991b1b` | `#dc2626` |
| `--tai-color-destructive-hover` | `#7f1d1d` | `#b91c1c` |
| `--tai-color-on-destructive`    | `#ffffff` | `#ffffff` |

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
once, so a dark override cannot silently move an offset or a blur.

| Token                        | Light                                         | Dark                |
| ---------------------------- | --------------------------------------------- | ------------------- |
| `--tai-shadow-lift-color`    | `rgb(0 0 0 / 0.08)`                           | `rgb(0 0 0 / 0.45)` |
| `--tai-shadow-overlay-color` | `rgb(0 0 0 / 0.16)`                           | `rgb(0 0 0 / 0.6)`  |
| `--tai-shadow-lift`          | `0 12px 32px var(--tai-shadow-lift-color)`    | _(same)_            |
| `--tai-shadow-overlay`       | `0 24px 48px var(--tai-shadow-overlay-color)` | _(same)_            |

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

## Design rules

These rules hold for every Studio screen and for a plugin page that wants to sit
beside them. They name the SDK pieces each case is built from, so a screen reads
the same way wherever it comes from.

**Tokens.** Colour, space, radius, type, motion and elevation come only from the
names in `TOKEN_NAMES`; a literal colour is never written. Every colour pair is
checked in both themes, the light `--tai-color-*` and the dark
`--tai-dark-color-*` values. A status is never told by hue alone: an icon or a word
sits beside it. The accent is the brand colour only, never a status.

**Spacing.** A page is padded by `.tai-page`. Vertical rhythm is `.tai-stack`
(space-4); inside a group it is `.tai-stack-2`, between groups in a card
`.tai-stack-3`, and between the sections of a page `.tai-stack-6`. A row of
controls is `.tai-row`.

**Screen patterns.** A new screen uses one of these patterns. A screen with tabs
under its header (Settings, Dashboard, Marketplace, the Conversations landing)
takes a pattern per tab.

- **Browse and inspect.** A split list and detail (`.tai-split`), with the
  selection held in the URL search. Tools, whose list pane is an `ExplorerView`;
  Presets; States; Storage; a Conversations route, its threads beside the open
  transcript.
- **Catalog.** A directory of cards with search and filters. Connectors and the
  Tools card view, through `ExplorerView`; the Marketplace Browse tab, a card grid
  with facet filters and Load more.
- **Registry.** Tables or lists of records in cards. Create and the row actions
  open a dialog built on `Dialog` (`FormDialog` or the screen's own); edit opens
  one too or happens in place; a destructive action is confirmed before it runs.
  Scheduling, Members, the Conversations routes and per-target configs, the
  Marketplace Installed tab, and the Profiles, API keys and Roles tabs of
  Settings.
- **Registry with inline create.** The records list first, then the create forms
  in cards on the page below them; edit, where a record has one, in a `Dialog`; a
  destructive action confirmed before it runs. Hooks, Served endpoints.
- **Replaced detail.** A search param swaps the page or the tab for one item. The
  Marketplace plugin page, a trace in the Dashboard Tracing tab, a state template
  or a state's records.
- **Run surface.** A list, then the run view in its place. Agents.
- **Inbox.** Newest-first cards, the rest paged in by a button at the foot: Load
  more where the server pages (Interactions), Show more where the whole feed is
  already loaded (Notifications).
- **Status and configuration.** Stacked cards of read-only views and in-place
  editors, no create dialog; a destructive or fleet-wide action is confirmed in a
  `ConfirmDialog`. Manifest, System, the Dashboard tab of Dashboard, the Settings,
  Environment and Backup tabs of Settings, and the Failed deliveries tab of the
  Conversations landing (one read-only card that re-reads itself).

A multi-step create is a `Stepper` inside a `Dialog`.

**States.** A page or a region (a card, a pane, a tab) shows one state at a time,
each drawn by its SDK piece:

- loading: a `Skeleton` in the shape of the content, or a labelled `Spinner` where
  the content has no fixed shape;
- empty: an `EmptyState` whose title says what is missing and whose `action`
  gives the next step;
- off, when the server answers that the feature is not configured:
  `FeatureDisabled`;
- no grant: as below;
- failed: an `ErrorState`, with `onRetry` when a retry can succeed;
- then the content.

Content already drawn stays when a later read fails (the next page, a secondary
read): the failure is shown beside it, as an `ErrorState` or a muted line saying
what could not be read and why. A control inside a form follows the picker rules
instead.

**No grant.** What the caller's access does not reach is not drawn. A write
control is hidden through `useCanWrite`, never shown disabled, and in its place,
where the reader would look for it, a muted `role="status"` line says what is out
of reach and, where the screen knows it, the access it needs ("Running this tool
is outside your access — it is shown read-only."). A whole region the caller
cannot read is an `EmptyState` whose title says it is not available and whose
description says what it would show and the access it needs. A no-grant state
has no Retry and never wears the error ground: a refusal is an answer, not a
failure. Readable content stays, read-only. A secondary control (a row's Delete)
is hidden without a line. A screen the caller cannot reach leaves the sidebar;
its URL still renders, and a refusal the screen did not expect is an
`ErrorState`.

**Disabled controls and results.** A control disabled for a reason the screen
does not otherwise show says the reason in text beside it. There is no toast: a
result is shown inline next to the control that caused it, a `role="status"` line
for an outcome and `role="alert"` (or an `ErrorState`) for a failure.

**Pickers.** A picker is an SDK component wrapped in `Field` with a visible
label. It reads a structural query interface
(`{ data, isPending, isError, isSuccess, error, refetch }`, the shape
`ExecutionKeyPicker` takes) and names no query library. Pending is the control
disabled with the placeholder "Loading <plural noun>…"; error is an `ErrorState`
with retry inside the field (`group` set); empty is a muted `role="status"` line
naming where to create one; no grant to read the list is the no-grant line in
place of the control. `ToolPicker` differs on a 403: the server checks a named
tool on save, so it draws a text input that takes the tool's exact name, with a
line under it saying the session cannot list tools (a host that draws the read's
failure elsewhere through `errorNote` keeps that line instead). Values render as text, never
HTML. A picker is composed outside `SchemaForm`. A picker whose list can grow long
(`ToolPicker`, `AgentPicker` and `ChannelPicker` are the cases the SDK ships) is built on
`SearchableSelect`, which opens with a search box over the option labels. Every
list searches by one rule, `matchesSearch(query, ...texts)`: the trimmed query,
ignoring case, inside any one of the texts a row is searched by. A filterable
checklist calls it over the label each row shows, and an `ExplorerView` search
names its texts per item (`texts`) and the view applies the rule. Two cases differ:

- A picker that is one control of a larger group on its host (a `fieldset` whose
  `legend` names the group) takes no label of its own: its control carries an
  `aria-label` that names it within the group (the legend, then what the control
  picks), and its states render in the same place without a `Field`.
- When the read behind the list fails and the same failure is already shown once,
  with retry, elsewhere on the same surface, the picker draws no second
  `ErrorState`: in place of the control it shows a muted `role="status"` line
  saying the list could not be read and where that error is shown, with no retry.
  A surface shows one failure with retry once.

**Stepper.** An ordered list in a labelled `nav`, with `aria-current="step"` on
the current step and each step's status spoken in visually hidden text. Done,
current, upcoming and error are told apart by marker shape and icon as well as
colour, filled with the ok and err tokens (never the accent, never a destructive
token). Tab and Enter or Space reach only the steps that can be revisited. Below
the narrow breakpoint (640 px) the list collapses to "Step n of m: <label>".
Motion follows the reduced-motion rule, and targets are 44 px on coarse pointers.

**Keyboard and accessibility.** There are no global shortcuts. Every interactive
element is reachable by Tab in reading order; Enter and Space work on custom rows;
the focus-visible ring comes from the five-state contract. A route change moves
focus to the page `<h1>`; dialogs trap focus and return it. The bar is WCAG
2.0/2.1 A and AA in both themes, enforced by an axe audit over every route and by
the SDK's guard tests.

## Usage

```ts
import type { PluginEntry } from '@tai42/studio-sdk';

export const register: PluginEntry = (ctx) => {
  ctx.registerPage({ path: 'dashboard', title: 'Dashboard', component: MyDashboard });
};
```

## License

Apache-2.0. See the repository `LICENSE`.
