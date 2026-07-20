// Vendor wrapper: the served `react-dom/client` module (createRoot /
// hydrateRoot). `react` and `react-dom` are external so this binds the shared
// /vendor/react.js and /vendor/react-dom.js instances; the scheduler it needs is
// bundled here (react-dom's main entry does not pull it, so there is one copy).
//
// Named exports are re-exported explicitly (not `export *`): the CJS client entry's
// named exports are not statically re-exportable through the Vite lib build's cjs
// interop, so `import { createRoot } from 'react-dom/client'` would otherwise fail.
import ReactDOMClient from 'react-dom/client';

export default ReactDOMClient;

export const { createRoot, hydrateRoot, version } = ReactDOMClient;
