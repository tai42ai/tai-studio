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

/** Props a contributed full page receives. Navigation is via shell route tokens. */
export interface PluginPageProps {
  readonly pluginId: string;
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

export interface NavEntryContribution {
  /**
   * Path of a page THIS plugin registers. The nav entry links to
   * `/plugins/{pluginId}/{path}`, so it must match a {@link PageContribution}
   * `path` of the same plugin — the registry rejects a nav entry with no page.
   */
  readonly path: string;
  readonly title: string;
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
