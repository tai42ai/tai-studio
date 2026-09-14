/**
 * The committed-entry mirror of the host's per-history-entry plugin state. The SDK
 * reconstructs and merges the `{ studioPluginEntryState: { [pluginId]: state } }`
 * `history.state` namespace so a vetoed Back restores the entry with the slot a
 * plugin navigation just wrote, rather than clobbering it with null.
 */

/**
 * The `history.state` namespace under which the host stores per-history-entry plugin
 * state, keyed by pluginId. Shared, by literal contract, with the shell's
 * `createNavigation` (which WRITES the slot) and the plugin catch-all page (which
 * READS it) — this SDK layer only reconstructs it for the committed-entry mirror.
 */
const ENTRY_STATE_KEY = 'studioPluginEntryState';

/**
 * Reconstruct the `history.state` bag a guard-approved plugin navigation LANDS on, so
 * a subsequently vetoed Back restores the entry with the state it just wrote intact
 * rather than clobbering it with null. Mirrors the host's
 * `{ studioPluginEntryState: { [pluginId]: state } }` namespace. TanStack's own
 * `key`/`__TSR_*` keys are unobservable at this layer, so this is a best-effort bag —
 * no worse than the `null` it replaces for those keys, and correct for the plugin slot.
 */
export function reconstructEntryState(pluginId: string, state: unknown): unknown {
  return { [ENTRY_STATE_KEY]: { [pluginId]: state } };
}

/**
 * Merge one plugin's state slot into a prior `history.state` bag, preserving BOTH the
 * router's own keys and every other plugin's slot. Used to refresh the committed entry
 * after an entry-state update, so a later vetoed Back restores the UPDATED slot instead
 * of the pre-update one.
 */
export function mergeEntryState(prev: unknown, pluginId: string, state: unknown): unknown {
  const base = prev !== null && typeof prev === 'object' ? (prev as Record<string, unknown>) : {};
  const priorSlot = base[ENTRY_STATE_KEY];
  const priorBag =
    priorSlot !== null && typeof priorSlot === 'object'
      ? (priorSlot as Record<string, unknown>)
      : {};
  return { ...base, [ENTRY_STATE_KEY]: { ...priorBag, [pluginId]: state } };
}
