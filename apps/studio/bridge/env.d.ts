/// <reference types="vite/client" />

/**
 * Build-time env for the standalone OAuth bridge artifact. `VITE_BRIDGE_ALLOWED_ROOT`
 * is the operator's root domain, baked in by scripts/build.mjs; unset falls back to
 * the `tai42.ai` default. Declaring it here keeps
 * `import.meta.env.VITE_BRIDGE_ALLOWED_ROOT` a typed `string | undefined` rather
 * than the `vite/client` fallback `any`.
 */
interface ImportMetaEnv {
  readonly VITE_BRIDGE_ALLOWED_ROOT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
