/** The secret bands for the install env dialog: which collected vars are marked
 * secret, and which are LOCKED secret (the server masks them regardless). */

/** One required-env entry as the install preview reports it. */
export interface PreviewEnvRequirement {
  readonly name: string;
  readonly secret: boolean;
}

export interface InstallEnvBands {
  /** Per var, whether its value is treated as a secret (preview, detail, or override). */
  readonly secretMap: Record<string, boolean>;
  /** Per var, whether the secret mark is LOCKED on (preview or detail says secret). */
  readonly lockedSecret: Record<string, boolean>;
}

/**
 * Fold the preview's authority, the detail-derived fallback, and the operator's
 * per-var override into the two bands the env fields render from. A var the preview
 * or the detail marks secret is LOCKED on (an off toggle would lie, since the server
 * masks it regardless); the override only turns a free var on.
 */
export function installEnvBands(
  missingVars: readonly string[],
  previewRequired: readonly PreviewEnvRequirement[],
  detailSecret: Record<string, boolean>,
  override: Record<string, boolean>,
): InstallEnvBands {
  const previewSecret: Record<string, boolean> = {};
  for (const req of previewRequired) previewSecret[req.name] = req.secret;
  const secretMap: Record<string, boolean> = {};
  const lockedSecret: Record<string, boolean> = {};
  for (const name of missingVars) {
    const locked = previewSecret[name] === true || detailSecret[name] === true;
    lockedSecret[name] = locked;
    secretMap[name] = locked || override[name] === true;
  }
  return { secretMap, lockedSecret };
}
