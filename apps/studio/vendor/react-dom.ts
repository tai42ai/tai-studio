// Vendor wrapper: the served `react-dom` module. `react` is external so the
// reconciler binds the one /vendor/react.js instance; react-dom itself is bundled.
//
// Named exports are re-exported explicitly (not `export *`): react-dom's CJS named
// exports are not statically re-exportable through the Vite lib build's cjs interop,
// so `import { flushSync } from 'react-dom'` would otherwise fail.
import ReactDOM from 'react-dom';

export default ReactDOM;

export const {
  __DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  createPortal,
  flushSync,
  preconnect,
  prefetchDNS,
  preinit,
  preinitModule,
  preload,
  preloadModule,
  requestFormReset,
  unstable_batchedUpdates,
  useFormState,
  useFormStatus,
  version,
} = ReactDOM;
