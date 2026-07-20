/**
 * The Studio-plugin API compatibility version.
 *
 * A monotonic integer bumped ONLY on a breaking change to the Studio-plugin API
 * OR the public prop/type surface of any DS component the SDK exports (a prop
 * rename/removal bumps it; genuinely internal/visual changes do not).
 *
 * Gate rule: equality is correct precisely because additive changes never
 * bump (existing plugins keep matching) and after a break every plugin must
 * rebuild by design. `targeted == current` accepts; anything else rejects.
 *
 * Additive evolution under this gate: a host that gains a NEW optional context
 * capability (a new `register*` method, a new host-side injection behavior)
 * keeps the same version, so every existing plugin loads unchanged. The one
 * asymmetry the equality gate leaves is a plugin that USES a newer capability on
 * an OLDER host that lacks it — and it fails loudly, by construction, not by any
 * negotiation machinery:
 *  - A plugin calling a context method the host does not define throws the
 *    natural `context.<method> is not a function` during `register`; the loader
 *    catches it as that plugin's loud error card and commits nothing.
 *  - A plugin shipping a `.css` asset to a host that does not inject stylesheets
 *    is served but never injected — the page renders with SDK-component styling
 *    only. This is the single quiet degradation the mechanism admits, and the
 *    authoring docs state it: stylesheet injection is a host capability, so a
 *    deployment pairs the Studio host with plugins built for it.
 */
export const STUDIO_PLUGIN_API_VERSION = 1;

export interface VersionGateResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/** Accept iff the plugin's targeted version exactly equals the host's. */
export function checkPluginApiVersion(
  targeted: number,
  current = STUDIO_PLUGIN_API_VERSION,
): VersionGateResult {
  if (targeted === current) return { ok: true };
  return {
    ok: false,
    reason: `plugin targets Studio API v${String(targeted)} but this host is v${String(current)} — the plugin must be rebuilt`,
  };
}
