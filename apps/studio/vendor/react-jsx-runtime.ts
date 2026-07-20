// Vendor wrapper: the served `react/jsx-runtime` module (automatic JSX). The
// React 19 jsx-runtime is self-contained; `react` is kept external so any internal
// reference binds the one /vendor/react.js instance.
//
// Named exports are re-exported explicitly (not `export *`): the CJS jsx-runtime's
// named exports are not statically re-exportable through the Vite lib build's cjs
// interop, so `import { jsxs } from 'react/jsx-runtime'` would otherwise fail.
import JsxRuntime from 'react/jsx-runtime';

export const { Fragment, jsx, jsxs } = JsxRuntime;
