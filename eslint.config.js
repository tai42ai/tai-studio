// @ts-check
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config for the whole monorepo.
 *
 * Architectural import boundaries are enforced with eslint-plugin-boundaries as
 * an ALLOWLIST (`boundaries/dependencies`, default `disallow`): every layer names
 * the internal layers and the third-party packages it may import, and anything
 * not named is rejected. This is stricter than a denylist — a feature can no
 * longer reach for an arbitrary npm package simply because no zone happened to
 * ban it.
 *
 *   - a feature package (`packages/features/*`) may import ONLY the SDK, the API
 *     client, and the packages in FEATURE_EXTERNAL — never another feature, never
 *     an unlisted third-party package;
 *   - the shell app (`apps/studio`) composes the features, the SDK, and the API
 *     client;
 *   - the SDK (`packages/studio-sdk`) imports only the API client internally;
 *   - the API client (`packages/api-client`) imports nothing internal;
 *   - the test support (`packages/test-support`, helpers shared by tests) imports
 *     only the API client, and a feature reaches it from TEST code alone.
 *
 * The SDK's dependency on the API client must be TYPE-ONLY at runtime: the
 * `@typescript-eslint/no-restricted-imports` rule further below enforces that
 * half of the boundary, while the allowlist grants the SDK the API client layer.
 *
 * The allowlist is exercised by a fixture test
 * (apps/studio/src/app/eslint-boundaries.test.ts) that lints a deliberate
 * cross-feature import and a deliberate arbitrary-external import through the
 * exported pieces below and asserts the rule reports each one.
 */

/**
 * Layers, classified by source-file path relative to the repo root. An import is
 * classified by the path it resolves to (see `import/resolver` below): a relative
 * import and a workspace package (`@tai42/studio-sdk`, `@tai42/feature-*`) alike
 * land on the layer that holds the file. The `feature` layer captures the feature
 * directory name, so a feature importing a DIFFERENT feature is rejected — no
 * policy lets a feature reach the feature layer — while a feature's own imports
 * stay intra-element and are allowed automatically.
 */
const boundariesElements = [
  { type: 'app', pattern: 'apps/studio' },
  { type: 'sdk', pattern: 'packages/studio-sdk' },
  { type: 'api-client', pattern: 'packages/api-client' },
  { type: 'test-support', pattern: 'packages/test-support' },
  {
    type: 'feature',
    pattern: 'packages/features/*',
    capture: ['feature'],
  },
];

// The allowlist grants whole layers: allowing the SDK allows every file in it,
// `@tai42/studio-sdk/testing` included. Subpath-level confinement (keeping the
// test-only `/testing` reset out of production code) is enforced by the
// `no-restricted-imports` override further below.

// Third-party packages each layer may import in production code. Kept in sync
// with the packages actually imported by each layer's source.
// `@tai42/jq-studio` is a separately-published package (its own npm release, not a
// workspace-internal @tai42/* like the SDK/features), so it is an EXTERNAL — and
// every consumer of the visual jq editor imports it DIRECTLY. The app injects the
// design-system primitives and installs the shared worker; a feature renders
// `JqField`. It is deliberately absent from SDK_EXTERNAL: the SDK holds no runtime
// edge to jq (see SDK_TEST_EXTERNAL and the barrel's doc-comment), and absent from
// FEATURE_EXTERNAL: the editor is granted per feature (JQ_EDITOR_FEATURES below),
// not to the feature layer at large.
const FEATURE_EXTERNAL = ['react', 'react-dom', '@tanstack/react-query', '@dnd-kit/core', 'uqr'];
const APP_EXTERNAL = ['react', 'react-dom', '@tanstack/*', 'zustand', '@tai42/jq-studio'];
const SDK_EXTERNAL = ['react', 'react-dom', '@radix-ui/*'];
const API_CLIENT_EXTERNAL = ['zod'];

// The features that render the visual jq editor, by captured feature name (the
// `feature` element's `*` segment). jq-studio is a multi-megabyte editor with a Web
// Worker and a wasm engine, so the grant is scoped to the features that actually
// author expressions — every other feature reaching for it is a boundary error, not
// a silently-allowed import.
const JQ_EDITOR_FEATURES = ['hooks', 'scheduling', 'settings'];

// Third-party packages allowed ONLY in test and test-support code (TEST_GLOBS),
// so production code cannot pull in a test runner or a mock server.
const FEATURE_TEST_EXTERNAL = ['vitest', '@testing-library/*'];
const APP_TEST_EXTERNAL = ['vitest', '@testing-library/*', 'msw'];
// The SDK reaches `@tai42/jq-studio` in TEST code only: one contract test asserts
// the real `JqField` still satisfies the mirrored injection contract. Production
// SDK source naming it would re-emit the editor, its worker, and its wasm into
// every bundling consumer.
const SDK_TEST_EXTERNAL = ['vitest', '@testing-library/*', '@tai42/jq-studio'];
const API_CLIENT_TEST_EXTERNAL = ['vitest'];

/** Test and test-support source files (e.g. `test-setup.ts`, `test-utils.tsx`). */
export const TEST_GLOBS = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/test-*.{ts,tsx}'];

// Size and complexity limits apply to PRODUCT SOURCE only. Test, spec and story
// files, and the whole e2e harness package, carry no size or complexity cap:
// their length and branching model scenarios, not shipped behaviour. These globs
// are excluded from the size/complexity block below.
export const SIZE_COMPLEXITY_IGNORES = [...TEST_GLOBS, '**/*.stories.{ts,tsx}', 'e2e/**'];

/** The eslint-plugin-boundaries settings every source file is linted with. */
export const boundariesSettings = {
  // Lint runs per package (cwd = each package dir), so pin path resolution to
  // the repo root; the elements' patterns are relative to it.
  'boundaries/root-path': import.meta.dirname,
  'boundaries/elements': boundariesElements,
  // Resolve imports the way TypeScript does: a `.ts`/`.tsx` target resolves to
  // its file, a workspace package through the tsconfig `paths` to its source
  // file, and a third-party package through `node_modules` to its real path.
  // Each import is then classified by the path it resolves to.
  'import/resolver': { typescript: { alwaysTryTypes: true } },
  // Use the current (non-legacy) capture-template data shape.
  'boundaries/legacy-templates': false,
};

/**
 * Builds the `boundaries/dependencies` allowlist. When `includeTestExternals` is
 * true the test-only packages AND Node core are added; it is enabled for
 * TEST_GLOBS only.
 *
 * @param {boolean} includeTestExternals
 */
export function boundariesDependenciesRule(includeTestExternals) {
  const external = (runtime, test) => ({
    to: {
      module: {
        origin: 'external',
        source: [...runtime, ...(includeTestExternals ? test : [])],
      },
    },
  });
  // Node core (`node:fs` and friends) in the SDK, the shell app and the API client
  // is a TEST-ONLY capability. The design-system source and manifest scanners READ
  // the monorepo's own files from disk rather than importing an architectural
  // layer, so their tests need it, and the API client's fixture tests read fixture
  // trees the same way; production library code must not reach it, and does not
  // get it — the API client ships to browsers, where a `node:` import breaks every
  // consumer at bundle time. Scoped by LAYER and by the test override, so a new
  // scanner test is covered the moment it is written — the alternative, an
  // exemption naming each scanner file, both goes stale and switches the whole
  // allowlist off for the files it names.
  const coreInTests = includeTestExternals
    ? [
        {
          from: { element: { type: ['sdk', 'app', 'api-client'] } },
          allow: { to: { module: { origin: 'core' } } },
        },
      ]
    : [];
  // The test support, a feature's in its TEST code alone: production feature source that
  // imports it is rejected, so a test helper never reaches a built feature.
  const featureTestSupport = includeTestExternals
    ? [
        {
          from: { element: { type: 'feature' } },
          allow: { to: { element: { type: ['test-support'] } } },
        },
      ]
    : [];
  return [
    'error',
    {
      default: 'disallow',
      // Also govern external and Node-core dependencies, not only local ones.
      checkAllOrigins: true,
      policies: [
        // A feature may import the SDK and the API client, plus its allowed
        // third-party packages — never another feature.
        {
          from: { element: { type: 'feature' } },
          allow: { to: { element: { type: ['sdk', 'api-client'] } } },
        },
        {
          from: { element: { type: 'feature' } },
          allow: external(FEATURE_EXTERNAL, FEATURE_TEST_EXTERNAL),
        },
        ...featureTestSupport,
        // The visual jq editor, granted only to the features that render it — the
        // element's captured `feature` name selects them, so the rest of the feature
        // layer still cannot import it.
        {
          from: { element: { type: 'feature', captured: { feature: JQ_EDITOR_FEATURES } } },
          allow: external(['@tai42/jq-studio'], []),
        },
        // The shell app composes the features and the two libraries.
        {
          from: { element: { type: 'app' } },
          allow: { to: { element: { type: ['feature', 'sdk', 'api-client'] } } },
        },
        {
          from: { element: { type: 'app' } },
          allow: external(APP_EXTERNAL, APP_TEST_EXTERNAL),
        },
        // The SDK is the leaf UI library: internally it may reach only the API client.
        {
          from: { element: { type: 'sdk' } },
          allow: { to: { element: { type: ['api-client'] } } },
        },
        {
          from: { element: { type: 'sdk' } },
          allow: external(SDK_EXTERNAL, SDK_TEST_EXTERNAL),
        },
        // The API client imports nothing internal; only its externals. Node core
        // it gets in TESTS alone, through `coreInTests` below — a `node:` import in
        // its production source would break every browser consumer at bundle time.
        {
          from: { element: { type: 'api-client' } },
          allow: external(API_CLIENT_EXTERNAL, API_CLIENT_TEST_EXTERNAL),
        },
        // The test support imports only the API client, the source of the readers it hands out.
        {
          from: { element: { type: 'test-support' } },
          allow: { to: { element: { type: ['api-client'] } } },
        },
        ...coreInTests,
      ],
    },
  ];
}

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.tsbuildinfo',
      // The reference plugin's COMPILED bundle (a build artifact shipped inside
      // the Python package, emitted by build:reference-plugin) — never linted.
      'e2e/reference-plugin/src/reference_plugin/studio/**',
      // The api-client modules GENERATED from the vendored platform artifacts (emitted by
      // the api-client's schema:generate) — the freshness gate is their tie, so they are
      // never hand-linted.
      'packages/api-client/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // Allow a deliberately-unused `_`-prefixed binding — e.g. a page component
      // that must declare its typed `PageProps` at the call site but reads no
      // search params (`_props`), or an intentionally-ignored destructure.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  // Deterministic import and export ordering across every source and test file.
  // Unlike the size/complexity floor this is not source-only: consistent ordering
  // applies to tests too. The rules only reorder — behaviour is unchanged — and
  // the fixer keeps side-effect imports in place.
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  // Size and complexity floor for product source (SOURCE-ONLY — see
  // SIZE_COMPLEXITY_IGNORES). A function/module/branch depth past these limits is
  // refactored into one-concern units, never silenced. `.tsx` gets a higher
  // per-function cap than `.ts` because a component's JSX return is a single
  // function whose length is layout, not logic.
  {
    files: ['**/*.{ts,tsx}'],
    ignores: SIZE_COMPLEXITY_IGNORES,
    rules: {
      complexity: ['error', 15],
      'max-depth': ['error', 4],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/*.ts'],
    ignores: SIZE_COMPLEXITY_IGNORES,
    rules: {
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/*.tsx'],
    ignores: SIZE_COMPLEXITY_IGNORES,
    rules: {
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
    },
  },
  // Architectural import boundaries (allowlist). The elements/settings apply to
  // every source file; the test override widens only the third-party allowlist.
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: boundariesSettings,
    rules: {
      'boundaries/dependencies': boundariesDependenciesRule(false),
    },
  },
  {
    files: TEST_GLOBS,
    plugins: { boundaries },
    rules: {
      'boundaries/dependencies': boundariesDependenciesRule(true),
    },
  },
  // The SDK is the leaf: it imports nothing WORKSPACE-INTERNAL at runtime.
  // Type-only imports are allowed (erased at build) so the hooks can be typed by
  // @tai42/api-client's `ApiClient`/`Interaction` without a runtime coupling that
  // would break the shared-singleton boundary. `@tai42/jq-studio` is excluded from
  // the group below because it is a SEPARATELY-PUBLISHED third-party package (its
  // own npm release, not part of this monorepo's graph — like `@radix-ui/*`); the
  // boundaries allowlist above is what actually confines it to SDK test code.
  {
    files: ['packages/studio-sdk/src/**/*.{ts,tsx}'],
    rules: {
      // `allowTypeImports` is honored only by the typescript-eslint variant, so
      // the base rule is disabled and the typed one enforces the boundary.
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tai42/*', '!@tai42/jq-studio'],
              allowTypeImports: true,
              message:
                'The SDK is the leaf package and must not import any workspace-internal @tai42/* package at runtime (type-only imports are allowed). The separately-published @tai42/jq-studio is not workspace-internal; it is confined to SDK test code by the boundaries allowlist.',
            },
          ],
        },
      ],
    },
  },
  // Production confinement of the test-only registry reset. The boundaries
  // allowlist grants the whole SDK layer, so `@tai42/studio-sdk/testing` (which
  // exposes `__resetContributions`) would otherwise be importable by any
  // production app/feature/SDK source allowed the SDK.
  // Forbid it in every non-test source file; TEST_GLOBS are excluded (via
  // `ignores`) so tests keep their access.
  {
    files: [
      'apps/studio/**/*.{ts,tsx}',
      'packages/features/*/src/**/*.{ts,tsx}',
      'packages/studio-sdk/src/**/*.{ts,tsx}',
    ],
    ignores: TEST_GLOBS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tai42/studio-sdk/testing'],
              message:
                'The test-only registry reset (@tai42/studio-sdk/testing) must never be imported by production code — it is for tests only.',
            },
          ],
        },
      ],
    },
  },
  // Plugin-author trust boundary (dev-time). A Studio plugin's front-end source
  // may import ONLY `@tai42/studio-sdk` (the plugin surface). The host registry API
  // (`@tai42/studio-sdk/host`) and the test-only reset (`@tai42/studio-sdk/testing`)
  // are host/test surfaces a plugin must never reach; forbid them here so the
  // reference plugin models the rule the plugin template ships (the ingest-time
  // check in the skeleton is the real enforcement — this catches it at author time).
  {
    files: ['e2e/reference-plugin/studio-src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tai42/studio-sdk/host', '@tai42/studio-sdk/testing'],
              message:
                'A Studio plugin must import only @tai42/studio-sdk (the plugin surface); the host registry API (/host) and the test-only reset (/testing) are off-limits.',
            },
          ],
        },
      ],
    },
  },
  // Tests: async fetch/stream mocks are idiomatic even without an `await`.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  // Build/config files (vite, playwright, eslint) run in Node and live outside
  // the app/lib tsconfig `include` globs — turn off type-checked rules for them.
  {
    files: [
      '**/*.config.{js,ts}',
      'eslint.config.js',
      'eslint.config.d.ts',
      'apps/studio/vendor/**/*.ts',
      '**/scripts/**/*.mjs',
    ],
    extends: [tseslint.configs.disableTypeChecked],
    plugins: { boundaries },
    rules: {
      // Tooling files legitimately import build packages (vite, vitest, tailwind)
      // that no architectural layer allows — the import boundary governs app/lib
      // SOURCE, not build config, so it does not apply here.
      'boundaries/dependencies': 'off',
    },
    languageOptions: {
      parserOptions: { projectService: false, project: false },
      // These run under Node (build/config scripts) — give them the Node globals
      // they use so `no-undef` does not flag `console`/`process`/`Buffer`/`URL`.
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        globalThis: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    // The import-boundary fixture test imports the eslint config it exercises, so
    // the architectural boundary rule does not apply to the test file itself.
    files: ['apps/studio/src/app/eslint-boundaries.test.ts'],
    plugins: { boundaries },
    rules: { 'boundaries/dependencies': 'off' },
  },
  // Byte-constant OAuth relay scripts: hand-written classic browser scripts
  // shipped verbatim from `public/`, outside the TS build. Type-checked rules do
  // not apply; give them the browser globals they use.
  {
    files: ['apps/*/public/**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        atob: 'readonly',
        Uint8Array: 'readonly',
        TextDecoder: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
  },
);
