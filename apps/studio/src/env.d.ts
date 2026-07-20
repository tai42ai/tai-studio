/// <reference types="vite/client" />

/**
 * Typed shell build-time env. `VITE_API_BASE_URL` is the optional cross-origin
 * override: unset (or '') means same-origin relative `/api` requests, which
 * is the supported v1 topology (the skeleton serves the built SPA). Declaring it
 * here keeps `import.meta.env.VITE_API_BASE_URL` a typed `string | undefined`
 * rather than the `vite/client` fallback `any`.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
