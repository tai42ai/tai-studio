// Vendor wrapper: the single served `react` module. The import map maps the
// bare `react` specifier to /vendor/react.js, so this file IS React for the whole
// page — the shell and every Studio-plugin bundle bind this one instance. React is
// bundled here (it depends on nothing external); everywhere else it is external.
import React from 'react';

export default React;

// Explicit named re-exports of React's public API. `export * from 'react'` yields
// only `default` here: React ships a CommonJS entry whose named exports the Vite
// lib build's cjs interop cannot statically re-export, so consumers doing
// `import { useLayoutEffect } from 'react'` would fail. Destructuring the default
// makes every name a static ESM export bound to this one React instance.
export const {
  Activity,
  Children,
  Component,
  Fragment,
  Profiler,
  PureComponent,
  StrictMode,
  Suspense,
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
  __COMPILER_RUNTIME,
  act,
  cache,
  cacheSignal,
  captureOwnerStack,
  cloneElement,
  createContext,
  createElement,
  createRef,
  forwardRef,
  isValidElement,
  lazy,
  memo,
  startTransition,
  unstable_useCacheRefresh,
  use,
  useActionState,
  useCallback,
  useContext,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  version,
} = React;
