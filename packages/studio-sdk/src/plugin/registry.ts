/**
 * The in-memory registry the shell reads, plus {@link loadPlugin} — the one entry
 * through which a plugin bundle's `register(context)` contributes to it. This module
 * is bundled only into the served `@tai42/studio-sdk/host` singleton (external across
 * the plugin boundary, like react and react-dom), so the module-level registry is
 * the SAME instance every host caller — the shell and the feature panels — sees. The
 * plugin surface (`@tai42/studio-sdk`) does not include it, so a plugin cannot reach it.
 */
import type {
  NavEntryContribution,
  PageContribution,
  PluginContext,
  PluginContributions,
  PluginEntry,
  RegisteredNavEntry,
  RegisteredPage,
  RegisteredSettingsTab,
  SettingsTabContribution,
  ToolPanelContribution,
} from './types';
import {
  EXPRESSION_EDITOR_CONTRACT_VERSION,
  type ExpressionEditorContribution,
} from '../expression/types';

const toolPanels = new Map<string, ToolPanelContribution>();
const pages: RegisteredPage[] = [];
const settingsTabs: RegisteredSettingsTab[] = [];
const navEntries: RegisteredNavEntry[] = [];
const expressionEditors = new Map<string, ExpressionEditorContribution>();

/**
 * Load one plugin: call its `register` entry with a context bound to `pluginId`,
 * then commit everything it staged into the global registry.
 *
 * Contributions are STAGED into local arrays (identity captured in the closure,
 * never read from ambient state) and only committed after `entry` settles
 * successfully. `entry` is AWAITED before commit, so a synchronous or an `async`
 * entry is fully done first: a post-`await` throw skips the commit (atomicity
 * holds for async too) and a post-`await` registration cannot slip past the batch.
 * The seal is set after `entry` has SETTLED — for a sync entry, after it returns
 * and the `await` continuation runs; for an async entry, after its returned promise
 * resolves. A registration attempted from that point on (a deferred timer, a
 * callback scheduled after settle) throws loudly instead of pushing into an
 * orphaned staged array that never commits. Registrations made during `entry`'s
 * synchronous body — including a microtask it enqueues then, which runs before the
 * `await` continuation — are still captured and committed with the batch. A
 * `register` that throws commits nothing and leaves the registry untouched.
 * Duplicate guards run against BOTH the staged contributions and what is already
 * committed, and fail loudly.
 */
export async function loadPlugin(pluginId: string, entry: PluginEntry): Promise<void> {
  const stagedPages: RegisteredPage[] = [];
  const stagedToolPanels = new Map<string, ToolPanelContribution>();
  const stagedSettingsTabs: RegisteredSettingsTab[] = [];
  const stagedTabIds = new Set<string>();
  const stagedNavEntries: RegisteredNavEntry[] = [];
  const stagedExpressionEditors = new Map<string, ExpressionEditorContribution>();
  let sealed = false;

  const context: PluginContext = {
    registerPage(contribution: PageContribution): void {
      if (sealed) {
        throw new Error(
          'registration is closed: a plugin must register during register(), not after it resolves',
        );
      }
      const staged = stagedPages.some((p) => p.path === contribution.path);
      const committed = pages.some((p) => p.pluginId === pluginId && p.path === contribution.path);
      if (staged || committed) {
        // A duplicate path within one plugin is an author mistake that would
        // leave one page unreachable — fail loudly, as registerToolPanel does.
        throw new Error(`plugin “${pluginId}” already registered a page at “${contribution.path}”`);
      }
      stagedPages.push({ ...contribution, pluginId });
    },
    registerToolPanel(contribution: ToolPanelContribution): void {
      if (sealed) {
        throw new Error(
          'registration is closed: a plugin must register during register(), not after it resolves',
        );
      }
      if (stagedToolPanels.has(contribution.toolName) || toolPanels.has(contribution.toolName)) {
        throw new Error(`a tool panel is already registered for ${contribution.toolName}`);
      }
      stagedToolPanels.set(contribution.toolName, contribution);
    },
    registerSettingsTab(contribution: SettingsTabContribution): void {
      if (sealed) {
        throw new Error(
          'registration is closed: a plugin must register during register(), not after it resolves',
        );
      }
      const committed = settingsTabs.some(
        (t) => t.pluginId === pluginId && t.id === contribution.id,
      );
      if (stagedTabIds.has(contribution.id) || committed) {
        // A duplicate tab id within one plugin would leave one tab unreachable —
        // fail loudly, mirroring the page-path guard.
        throw new Error(
          `plugin “${pluginId}” already registered a settings tab “${contribution.id}”`,
        );
      }
      stagedTabIds.add(contribution.id);
      stagedSettingsTabs.push({ ...contribution, pluginId });
    },
    registerNavEntry(contribution: NavEntryContribution): void {
      if (sealed) {
        throw new Error(
          'registration is closed: a plugin must register during register(), not after it resolves',
        );
      }
      const staged = stagedNavEntries.some((e) => e.path === contribution.path);
      const committed = navEntries.some(
        (e) => e.pluginId === pluginId && e.path === contribution.path,
      );
      if (staged || committed) {
        // A duplicate nav path within one plugin is an author mistake — two
        // entries pointing at the same page — so fail loudly like the page guard.
        throw new Error(
          `plugin “${pluginId}” already registered a nav entry at “${contribution.path}”`,
        );
      }
      stagedNavEntries.push({ ...contribution, pluginId });
    },
    registerExpressionEditor(contribution: ExpressionEditorContribution): void {
      if (sealed) {
        throw new Error(
          'registration is closed: a plugin must register during register(), not after it resolves',
        );
      }
      // Contract-version mismatch is a LOUD per-plugin registration error, never a
      // silent skip: an editor built against a different props contract would mount
      // with the wrong props, so it is rejected during register() and becomes this
      // plugin's error card. Checked before the duplicate guard so a mismatched
      // contribution never claims a language.
      if (contribution.contractVersion !== EXPRESSION_EDITOR_CONTRACT_VERSION) {
        throw new Error(
          `plugin “${pluginId}” registered an expression editor for “${contribution.language}” ` +
            `targeting contract v${String(contribution.contractVersion)} but this host is ` +
            `v${String(EXPRESSION_EDITOR_CONTRACT_VERSION)} — the editor must be rebuilt`,
        );
      }
      // A language is a GLOBAL key: at most one editor across the deployment. A
      // second contribution for a language already staged or committed (by this
      // plugin or another) would leave one editor unreachable — fail loudly, as
      // registerToolPanel does for a tool name.
      if (
        stagedExpressionEditors.has(contribution.language) ||
        expressionEditors.has(contribution.language)
      ) {
        throw new Error(
          `an expression editor is already registered for language ${contribution.language}`,
        );
      }
      stagedExpressionEditors.set(contribution.language, contribution);
    },
  };

  try {
    await entry(context);
  } finally {
    // Whether `entry` resolved or threw, no further registration is valid — seal
    // so a deferred call fails loudly rather than pushing into an orphaned array.
    sealed = true;
  }

  // Every nav entry must link to a page THIS plugin registers — staged in this
  // call or already committed. A nav entry with no matching page is a guaranteed
  // dead link (the plugin page surface renders "Page not found"), so reject it
  // loudly. This throws BEFORE the commit loops, so it propagates out of
  // `loadPlugin` and NOTHING (pages, panels, tabs, nav) commits — atomicity holds.
  for (const navEntry of stagedNavEntries) {
    const hasPage =
      stagedPages.some((p) => p.path === navEntry.path) ||
      pages.some((p) => p.pluginId === pluginId && p.path === navEntry.path);
    if (!hasPage) {
      throw new Error(
        `plugin “${pluginId}” registered a nav entry at “${navEntry.path}” but no page at that path`,
      );
    }
  }

  // `entry` resolved without throwing: commit the staged contributions as one
  // batch, so the registry only ever holds a plugin's complete set — never a
  // partial set left behind by a mid-registration failure.
  for (const page of stagedPages) {
    pages.push(page);
  }
  for (const [toolName, contribution] of stagedToolPanels) {
    toolPanels.set(toolName, contribution);
  }
  for (const tab of stagedSettingsTabs) {
    settingsTabs.push(tab);
  }
  for (const navEntry of stagedNavEntries) {
    navEntries.push(navEntry);
  }
  for (const [language, contribution] of stagedExpressionEditors) {
    expressionEditors.set(language, contribution);
  }
}

/** The shell reads this after loading every installed plugin bundle. */
export function getContributions(): PluginContributions {
  return { toolPanels, pages, settingsTabs, navEntries, expressionEditors };
}

/** Tests reset the module-level registry between cases. */
export function __resetContributions(): void {
  toolPanels.clear();
  pages.length = 0;
  settingsTabs.length = 0;
  navEntries.length = 0;
  expressionEditors.clear();
}
