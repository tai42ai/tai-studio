---
'@tai42/studio-sdk': minor
---

Design system v2: the token contract, the webfonts, the component + responsive CSS
layer, the icon set, and the layout primitives every screen builds on.

- **Runtime dependencies (new, published contract):** `@fontsource-variable/inter`
  and `@fontsource-variable/geist-mono`. The SDK barrel side-effect-imports them
  beside `tokens.css`, so a host app loads each face once and a plugin never
  ships its own copy.
- **Tokens** (`tokens.css` / `TOKEN_NAMES`): every themed value is written exactly
  once — the light value under the token's own name, the dark value beside it
  under a `--tai-dark-` name — and two blocks put the dark half into service: a
  `prefers-color-scheme: dark` query for the OS preference and a
  `[data-theme="dark"]` block for the viewer's explicit choice, which pins the
  theme in both directions. `color-scheme` follows the same three states, so
  native scrollbars, selects, and form autofill match the tokens. A
  `--tai-z-popover` layer joins the z-scale between `dialog`
  and `tooltip`, for the popups that portal to the document body and so have to
  clear a dialog's scrim to be usable. `TOKEN_NAMES` grows ADDITIVELY (no rename, no removal, so the
  plugin styling API is unchanged): the accent tier
  (`accent`, `accent-hover`, `accent-on-tint`, `accent-tint`, `on-accent`), the
  contrast-safe `control-border`, the `decor` non-text tier, the semantic
  `-text`/`-fill`/`-tint` split with its `on-fill` ink, `scrim`, the syntax
  tints, `code-bg`, `heading`, `placeholder`, the disabled tier, the control
  heights, the motion pair, the `-lift`/`-overlay` shadows with the
  `-lift-color`/`-overlay-color` halves they theme through, the
  `prose-link`/`prose-link-hover` pair, and the z-scale.
  `--tai-color-danger-hover` is new: the danger button had no hover fill.
  Five token names that were referenced but never defined now resolve:
  `--tai-text-xl`, `--tai-text-xs`, `--tai-space-5`, `--tai-radius-full`,
  `--tai-color-danger-surface`.
- **Deliberate VALUE shifts on kept names** (nothing renamed, so no compatibility
  bump): `--tai-text-lg` 18px → 15px, `--tai-text-md` 15px → 13.5px,
  `--tai-text-sm` 13px → 12.5px; `--tai-color-primary` and its siblings resolve
  to crimson rather than blue, and `--tai-color-danger`/`-success`/`-warning`
  resolve to the `-text` members that stay legible as text. The largest shift is
  in the elevation pair: `--tai-shadow-sm` was a resting shadow
  (`0 1px 2px rgba(16,24,40,.06)`) and now aliases `--tai-shadow-lift`
  (`0 12px 32px`), and `--tai-shadow-md` was `0 4px 12px rgba(16,24,40,.1)` and
  now aliases `--tai-shadow-overlay` (`0 24px 48px`) — so a plugin that used
  either as a resting card shadow gets a lift or an overlay in its place and
  should move to the tier it means. `--tai-color-primary-text` and
  `--tai-color-danger-text` were `#ffffff` in BOTH themes and are now
  per-theme — `#ffffff` light, `#0c0e12` dark — because white on the dark accent
  and danger fills reaches only 3.6:1. Type and spacing
  tokens are authored in rem so a viewer's font-size preference scales them;
  line-height and weight moved out of the tokens into the component classes.
- **New stylesheets:** `fonts.css` and `components.css`, both reachable as
  `@tai42/studio-sdk/fonts.css` and `@tai42/studio-sdk/components.css`. The
  build now fails if any `src/**/*.css` is unimported, missing from `dist/`, or
  absent from the `exports` map.
- **Additive component API:** `PageHeader`, `Page`, `Stack`, `Drawer`,
  `ScrollRegion`, the `useProseScrollRegions` hook, and the `useBreakpoint` hook.
  `Button` gains a `ghost` variant and a link form — given an `href` it renders an
  anchor: a relative reference stays in-app, an absolute http(s) URL opens in a
  new tab, and any other scheme is neutralized into plain text.
  `ExternalLinkButton` now delegates to it rather than holding a second copy of
  that check, and keeps its own stricter policy — for a URL the Studio did not
  author, only an absolute http(s) URL is navigable. `RadioGroup` gains
  per-option `icon` and `visuallyHiddenLabel`, a standalone `label`, an
  `orientation`, and a compact `segmented` variant. `Card` gains `interactive`
  for the hover/focus lift, `EmptyState` an `action` slot, and `JsonTree` a
  `label` for the region it becomes while its pane overflows. `RadioGroup`'s
  `orientation` is unset unless a caller names one, so an unnamed group keeps
  moving on both arrow axes; naming one pins the axis and the layout together.
  `Select` marks the chosen option with a check, so the keyboard highlight — which
  only says where the reader is — is no longer the sole cue for what is set.
  `Dialog` and `Drawer` return focus to the opener when they render no trigger,
  which is the case Radix's own trigger-based restore cannot cover.
- **Browser support:** the stylesheets ship as authored, so the CSS they use sets
  the floor — `@layer` and `:focus-visible`, at Chrome/Edge 99, Firefox 97, Safari
  and iOS Safari 15.4 — now declared in `browserslist` rather than left implicit.
  `light-dark()` is deliberately not used: it would raise that floor to Chrome 123
  / Firefox 120 / Safari 17.5 and drop the whole palette at once below it. Under
  `prefers-reduced-motion` the published `--tai-motion-fast` / `--tai-motion-base`
  durations resolve to `0ms`, so plugin CSS written against them honours the
  preference without reading the media query itself.
- **Icons:** a hand-authored inline-SVG set (24-unit grid, 1.6 stroke,
  `currentColor`, `aria-hidden` by default) plus the `NAV_ICONS` route-token
  map. It is the single source of iconography, so `RevealInput`'s eye marks join
  it as the exported `EyeIcon` / `EyeOffIcon`, and the reorder arrows in
  `ApplyExtensions` join it as `ArrowUpIcon` / `ArrowDownIcon`. The Unicode
  glyphs that stood in for marks in `Checkbox`, `TagChips`, and `Select` are
  replaced by real icons, and the repository-wide scan that enforces the ban now
  covers `↑ ↓ ←` alongside `▲ ▼ ▾ ↗ → ✓ ×`.
- **Removed:** `@keyframes tai-pulse`, which the loading skeleton was its only
  user of. The skeleton now runs `tai-shimmer`, which travels a gradient overlay
  across the block on `transform`; the opacity pulse only dimmed the block and
  never moved a band across it. A plugin animating `tai-pulse` off the published
  `tokens.css` must declare its own keyframe. `.tai-skeleton` now also owns a
  `::after` pseudo-element and carries `position: relative` + `overflow: hidden`,
  so it establishes a stacking and overflow context: a consumer styling the class
  inherits those, and its own `::after` would be overridden.
- **How both themes are verified.** `vitest.config.ts` sets `css: false`, so no
  stylesheet ever loads in jsdom and a rendered dark-mode assertion is not
  reachable in these suites at all. What holds the two themes together is
  static and repo-wide: `token-usage.test.ts` proves every theme-varying token
  has both halves, that the two dark blocks carry the same set and no values of
  their own, and that no dark value is read by any other route — plus the
  rendered screenshot sweep in PLAN_5. Recorded here so PLAN_1/2/3 build on a
  stated position rather than an unstated gap.
- **Testing helpers** (`@tai42/studio-sdk/testing`): `installJsdomStubs` now
  installs a WORKING `ResizeObserver`, and `flushResizeObservers` +
  `setElementOverflow` let a suite drive a component that measures its own
  overflow.
