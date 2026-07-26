---
'@tai42/studio-sdk': minor
---

Design system v2: the token contract, the webfonts, the component + responsive CSS
layer, the icon set, and the layout primitives every screen builds on.

- **Runtime dependencies (new, published contract):** `@fontsource-variable/inter`
  and `@fontsource-variable/geist-mono`. The SDK barrel side-effect-imports them
  beside `tokens.css`, so a host app loads each face once and a plugin never
  ships its own copy.
- **Tokens** (`tokens.css` / `TOKEN_NAMES`): every themed value now carries both
  its light and its dark value in one `light-dark()` pair, with `color-scheme`
  selecting between them — the root follows the OS preference and `data-theme`
  pins it in both directions, which also drives native scrollbars, selects, and
  form autofill. A `--tai-z-popover` layer joins the z-scale between `dialog`
  and `tooltip`, for the popups that portal to the document body and so have to
  clear a dialog's scrim to be usable. `TOKEN_NAMES` grows ADDITIVELY (no rename, no removal, so the
  plugin styling API is unchanged): the accent tier
  (`accent`, `accent-hover`, `accent-on-tint`, `accent-tint`, `on-accent`), the
  contrast-safe `control-border`, the `decor` non-text tier, the semantic
  `-text`/`-fill`/`-tint` split with its `on-fill` ink, `scrim`, the syntax
  tints, `code-bg`, `heading`, `placeholder`, the disabled tier, the control
  heights, the motion pair, the `-lift`/`-overlay` shadows, and the z-scale.
  `--tai-color-danger-hover` is new: the danger button had no hover fill.
  Five token names that were referenced but never defined now resolve:
  `--tai-text-xl`, `--tai-text-xs`, `--tai-space-5`, `--tai-radius-full`,
  `--tai-color-danger-surface`.
- **Deliberate VALUE shifts on kept names** (nothing renamed, so no compatibility
  bump): `--tai-text-lg` 18px → 15px, `--tai-text-md` 15px → 13.5px,
  `--tai-text-sm` 13px → 12.5px; `--tai-color-primary` and its siblings resolve
  to crimson rather than blue, and `--tai-color-danger`/`-success`/`-warning`
  resolve to the `-text` members that stay legible as text. Type and spacing
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
- **Browser support:** the stylesheets ship as authored, so `light-dark()` sets
  the floor — Chrome/Edge 123, Firefox 120, Safari and iOS Safari 17.5 — now
  declared in `browserslist` rather than left implicit. Under
  `prefers-reduced-motion` the published `--tai-motion-fast` / `--tai-motion-base`
  durations resolve to `0ms`, so plugin CSS written against them honours the
  preference without reading the media query itself.
- **Icons:** a hand-authored inline-SVG set (24-unit grid, 1.6 stroke,
  `currentColor`, `aria-hidden` by default) plus the `NAV_ICONS` route-token
  map. It is the single source of iconography, so `RevealInput`'s eye marks join
  it as the exported `EyeIcon` / `EyeOffIcon`. The Unicode glyphs that stood in for marks in `Checkbox`, `TagChips`, and
  `Select` are replaced by real icons.
- **Removed:** `@keyframes tai-pulse`, which the loading skeleton was its only
  user of. The skeleton builds a sweep gradient, so it now runs `tai-shimmer`,
  which animates `background-position`; the opacity pulse never moved that
  gradient. A plugin animating `tai-pulse` off the published `tokens.css` must
  declare its own keyframe.
- **Testing helpers** (`@tai42/studio-sdk/testing`): `installJsdomStubs` now
  installs a WORKING `ResizeObserver`, and `flushResizeObservers` +
  `setElementOverflow` let a suite drive a component that measures its own
  overflow.
