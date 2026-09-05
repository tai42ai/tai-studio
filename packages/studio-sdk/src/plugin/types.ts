/**
 * The Studio-plugin authoring contract. A platform plugin ships an ESM bundle
 * that exports a `register(context)` entry ({@link PluginEntry}); the host calls
 * it with a {@link PluginContext} through which the plugin contributes tool
 * panels, pages, settings tabs, and sidebar nav entries.
 *
 * Two styling paths are sanctioned, and only these two:
 *  1. SDK components plus inline styles that read the design-system tokens
 *     (`var(--tai-*)`). Raw Tailwind utilities are host-internal, not part of
 *     this contract.
 *  2. A plugin-shipped SCOPED stylesheet, listed in the bundle's manifest
 *     `integrity` map as a `.css` asset and HOST-injected as an SRI'd
 *     `<link rel="stylesheet">` before the bundle's JS is imported. It is bound
 *     by three hard rules: (a) no global resets/preflight — never style `html`,
 *     `body`, `:root`, `*`, or bare element selectors at top level; (b) every
 *     selector is scoped under a plugin root class the plugin renders itself,
 *     prefixed with the plugin's own package name; (c) theme values in
 *     PLUGIN-AUTHORED rules come from the SDK custom properties (`var(--tai-*)`),
 *     never hardcoded colors, so the stylesheet themes itself with no logic of
 *     its own. Bundled third-party base CSS is exempt from rule (c) but rules
 *     (a) and (b) still bind it.
 */
import type { ComponentType } from 'react';

/**
 * A capability requirement a contribution may declare. `routes` is a list of
 * route-path prefixes (anyOf semantics, the same evaluator the shell nav uses):
 * the contribution renders iff the caller's capability projection covers at least
 * one of them. ABSENT (the field is optional) means the contribution renders only
 * for a FULL projection — safe-by-default for every existing plugin, which never
 * declared a requirement. The server remains the authority; this only shapes what
 * the UI advertises.
 */
export interface RequiredCapabilities {
  readonly routes: readonly string[];
}

/** Props a contributed tool-run panel receives (replaces the auto-form). */
export interface ToolPanelProps {
  /** The tool name this panel targets. */
  readonly toolName: string;
  /** The tool's JSON schema (Pydantic-emitted), for panels that introspect it. */
  readonly schema: Record<string, unknown>;
  /** Run the tool with arguments; resolves with the typed result or throws. */
  readonly run: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Props a contributed full page receives. A page is deep-linkable: the shell mounts
 * it at `/plugins/{pluginId}/{path}` and, when the contribution declares a
 * {@link PluginPageParamsSchema}, forwards the VALIDATED sub-path remainder as
 * `params` and the VALIDATED search object as `search`. Both are OPTIONAL — a page
 * that declares no schema receives neither (and accepts no sub-path), so this stays
 * a non-breaking addition to every existing contribution and the plugin API version
 * does not move. Navigate between plugin pages with `usePluginNavigation`.
 */
export interface PluginPageProps {
  readonly pluginId: string;
  /** The validated sub-path remainder (present only when the page declared a schema). */
  readonly params?: Record<string, unknown>;
  /** The validated search object (present only when the page declared a schema). */
  readonly search?: Record<string, unknown>;
  /**
   * The per-history-entry state slot the host stored for THIS plugin on the current
   * history entry (written via `navigatePluginWithOptions` / `updatePluginEntryState`
   * on the SDK navigation surface), or `undefined` when none was set. It survives
   * back/forward traversal and a hard reload, because the host round-trips it through
   * `history.state`. OPTIONAL — a page that never uses the entry-state channel receives
   * `undefined`, so this stays a non-breaking addition and the plugin API version does
   * not move.
   *
   * FAILURE-DIVERGENCE — why there is no host-side schema for it, unlike `params` /
   * `search`: those two come from the URL, a shareable and forgeable surface, so a bad
   * one is a broken LINK — the host VALIDATES them against the page's
   * {@link PluginPageParamsSchema} and renders a LOUD error card on rejection, never a
   * half-populated view. `entryState` is different in kind: it is opaque, author-written
   * data the host only round-trips through `history.state`, never parses and never shows
   * a human, and the page that wrote it owns its shape. So the host delivers it RAW and
   * the page MUST degrade GRACEFULLY on anything unexpected — treat a malformed or absent
   * value as "no checkpoint" and fall back to defaults, never throw. That asymmetry —
   * an error card at the host for URL surfaces, graceful raw delivery for entry state —
   * is exactly why entry state carries no host-side schema slot.
   */
  readonly entryState?: unknown;
}

/**
 * A page's optional deep-link schema. The shell resolves a URL to a page by
 * LONGEST registered `path` prefix; the remainder of the URL after the matched
 * prefix is handed to `parseParams`, and the raw search object to `parseSearch`.
 * Each parser VALIDATES and shapes its input, RAISING on anything it rejects — the
 * shell renders that throw as a loud error card, never a blank or partial view. A
 * contribution that omits the schema entirely accepts no sub-path (the pre-deep-link
 * behavior, unchanged). Omitting just one parser leaves that half unvalidated:
 * absent `parseParams` means the page still matches only its exact `path`; absent
 * `parseSearch` means `search` is not forwarded.
 */
export interface PluginPageParamsSchema {
  /** Validate + shape the sub-path remainder after this page's prefix; throws to reject. */
  readonly parseParams?: (remainder: string) => Record<string, unknown>;
  /** Validate + shape the raw search object; throws to reject. */
  readonly parseSearch?: (raw: Record<string, unknown>) => Record<string, unknown>;
}

/** Props a contributed settings tab receives. */
export interface SettingsTabProps {
  readonly pluginId: string;
}

export interface ToolPanelContribution {
  readonly toolName: string;
  readonly component: ComponentType<ToolPanelProps>;
}

export interface PageContribution {
  /** URL segment under `/plugins/{pluginId}/`. */
  readonly path: string;
  readonly title: string;
  readonly component: ComponentType<PluginPageProps>;
  /** Capability gate (see {@link RequiredCapabilities}); absent ⇒ full-only. */
  readonly requiredCapabilities?: RequiredCapabilities;
  /**
   * Deep-link schema (see {@link PluginPageParamsSchema}). When present the page is
   * addressable under its `path` PREFIX, and the shell validates the sub-path
   * remainder + search before rendering. Absent ⇒ the page matches only its exact
   * `path` and receives no `params`/`search` (unchanged behavior).
   */
  readonly params?: PluginPageParamsSchema;
}

/**
 * A page as stored in the registry: the plugin's {@link PageContribution} plus
 * the id of the plugin that registered it. The `pluginId` is stamped by the
 * registry from the identity the host passed to {@link PluginEntry} — a plugin
 * never supplies its own id — so a page resolves only under its owner's
 * `/plugins/{pluginId}/` prefix and two plugins may register the same `path`
 * without colliding.
 */
export interface RegisteredPage extends PageContribution {
  readonly pluginId: string;
}

/**
 * The sidebar section a nav entry renders in. A named core section groups the
 * entry there, after that section's core rows. An absent field or any value that
 * is not a live core section renders the entry in the shared "Plugins" section that
 * follows the core sections (alongside every other undeclared plugin entry),
 * placed after the core sections. The shell tolerates an unknown value at runtime
 * (a bundle newer than this host), falling back to that shared section, so the
 * field is a placement hint, never a hard contract.
 */
export type NavEntrySection =
  'Capabilities' | 'Connections' | 'Triggers' | 'Activity' | 'Administration';

export interface NavEntryContribution {
  /**
   * Path of a page THIS plugin registers. The nav entry links to
   * `/plugins/{pluginId}/{path}`, so it must match a {@link PageContribution}
   * `path` of the same plugin — the registry rejects a nav entry with no page.
   */
  readonly path: string;
  readonly title: string;
  /**
   * Optional target sidebar section (see {@link NavEntrySection}); absent ⇒ the
   * shared "Plugins" section. Additive — an older bundle omits it and stays
   * on the same plugin API version.
   */
  readonly section?: NavEntrySection;
  /**
   * Optional sort weight WITHIN the entry's section (whether a core section or the
   * shared "Plugins" one): entries render in ascending `order`, and every
   * entry that omits it sorts AFTER the ordered ones, in registration order. Two
   * entries with the same `order` keep registration order (a stable sort). Additive —
   * an older bundle omits it and stays on the same plugin API version.
   */
  readonly order?: number;
  /**
   * Optional icon rendered before the title. It must be a square inline SVG that
   * fills its box and draws with `currentColor`; the host constrains the slot,
   * rendering it inside a fixed 1em box, `aria-hidden` (the accessible name is
   * `title`), with the color inherited from the link. Its bytes live inside the
   * plugin bundle, so no external fetch and no CSP change. Absent icon renders a
   * text-only entry, exactly like the core nav.
   */
  readonly icon?: ComponentType;
  /** Capability gate (see {@link RequiredCapabilities}); absent ⇒ full-only. */
  readonly requiredCapabilities?: RequiredCapabilities;
}

/**
 * A nav entry as stored in the registry: the plugin's
 * {@link NavEntryContribution} plus the id of the plugin that registered it. The
 * `pluginId` is stamped by the registry from the identity the host passed to
 * {@link PluginEntry}, so the entry links only under its owner's
 * `/plugins/{pluginId}/` prefix and two plugins may register the same `path`
 * without colliding.
 */
export interface RegisteredNavEntry extends NavEntryContribution {
  readonly pluginId: string;
}

export interface SettingsTabContribution {
  readonly id: string;
  readonly title: string;
  readonly component: ComponentType<SettingsTabProps>;
  /** Capability gate (see {@link RequiredCapabilities}); absent ⇒ full-only. */
  readonly requiredCapabilities?: RequiredCapabilities;
}

/**
 * A settings tab as stored in the registry: the plugin's
 * {@link SettingsTabContribution} plus the id of the plugin that registered it.
 * The `pluginId` is stamped by the registry from the identity the host passed to
 * {@link PluginEntry} — a plugin never supplies its own id — so a tab is always
 * attributable to its owner and two plugins may register the same tab `id`
 * without colliding.
 */
export interface RegisteredSettingsTab extends SettingsTabContribution {
  readonly pluginId: string;
}

/** Everything a single plugin bundle has registered at import time. */
export interface PluginContributions {
  readonly toolPanels: ReadonlyMap<string, ToolPanelContribution>;
  readonly pages: readonly RegisteredPage[];
  readonly settingsTabs: readonly RegisteredSettingsTab[];
  readonly navEntries: readonly RegisteredNavEntry[];
}

/**
 * The registration surface a plugin receives in its `register(context)` entry.
 * Each method binds the contribution to the plugin the host is loading — the
 * plugin's identity is fixed by the host, not read from any ambient state — so a
 * contribution can never be misattributed to another plugin. Contributions are
 * staged and committed together once `register` settles; a `register` that throws
 * commits nothing. The context is SEALED once `register` settles: a call made
 * after that (a deferred timer, a post-resolve microtask) throws instead of
 * silently dropping, so every registration must happen during `register`.
 */
export interface PluginContext {
  /** Register a full page mounted under `/plugins/{pluginId}/{path}`. */
  registerPage(contribution: PageContribution): void;
  /** Register a rich run panel for a tool by name (overrides the auto-form). */
  registerToolPanel(contribution: ToolPanelContribution): void;
  /** Register a settings tab. */
  registerSettingsTab(contribution: SettingsTabContribution): void;
  /**
   * Register a sidebar nav entry linking to one of this plugin's pages at
   * `/plugins/{pluginId}/{path}`. The `path` must match a page the plugin also
   * registers (a nav entry with no page is a dead link and is rejected loudly).
   */
  registerNavEntry(contribution: NavEntryContribution): void;
}

/**
 * A plugin bundle's entry: the default plugin API. The host imports the bundle,
 * reads its `register` export, and calls it with a {@link PluginContext}. All
 * contributions flow through that context — there are no free registration
 * functions. The entry may be synchronous or `async`; the host awaits it before
 * committing, so an async entry must complete every registration before it
 * resolves (see the seal on {@link PluginContext}).
 */
export type PluginEntry = (context: PluginContext) => void | Promise<void>;
