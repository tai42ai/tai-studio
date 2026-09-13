// Generate the served-document zod schemas from the platform's published contract
// JSON-schema bundle.
//
// Input:  packages/api-client/contract-schema/contract-schema.json (the vendored
//         bundle, cut from a pinned tai42-contract major).
// Output: packages/api-client/src/generated/served-schemas.ts (one exported zod
//         const + inferred type per published document and per shared sub-shape).
//
// Run `pnpm --filter @tai42/api-client run schema:generate` to rewrite the output,
// or `... schema:check` to fail when the committed output is stale.
//
// A field the platform marks `x-tai42-templated-text` maps to the shared
// `templatedText` zod (never a bare string); every `$ref` maps to the referenced
// const by name, so the emitted schemas share one definition of each sub-shape.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { jsonSchemaToZod } from 'json-schema-to-zod';

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(here, '../contract-schema/contract-schema.json');
const OUTPUT_PATH = resolve(here, '../src/generated/served-schemas.ts');
const REGENERATE_COMMAND = 'pnpm --filter @tai42/api-client run schema:generate';

const SHARED_TEMPLATED_TEXT = 'templatedText';

const camel = (name) => name.charAt(0).toLowerCase() + name.slice(1);

const refName = (ref) => {
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!match) throw new Error(`Unsupported $ref (only #/$defs/* is published): ${ref}`);
  return match[1];
};

// json-schema-to-zod does not resolve $ref itself, so the override is the seam
// that (a) points every reference at the const emitted for that sub-shape and
// (b) forces a templated-text field to the shared `templatedText` zod.
const parserOverride = (schema) => {
  if (schema && typeof schema === 'object' && typeof schema.$ref === 'string') {
    const name = refName(schema.$ref);
    return name === 'TemplatedText' ? SHARED_TEMPLATED_TEXT : camel(name);
  }
  if (schema && typeof schema === 'object' && 'x-tai42-templated-text' in schema) {
    return SHARED_TEMPLATED_TEXT;
  }
  return undefined;
};

// A pydantic list/dict field with a default_factory is neither `required` nor
// carries a static `default` in model_json_schema(), yet it is always present in a
// served payload and callers treat it as present. Model that: give every
// non-required, non-nullable bare array/dict property the empty default the platform
// fills, so the generated field is `[]`/`{}` (always present) rather than optional.
const applyPydanticDefaults = (node) => {
  if (Array.isArray(node)) {
    for (const item of node) applyPydanticDefaults(item);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object' && node.properties && typeof node.properties === 'object') {
    const required = new Set(Array.isArray(node.required) ? node.required : []);
    for (const [key, prop] of Object.entries(node.properties)) {
      if (!prop || typeof prop !== 'object') continue;
      if ('default' in prop || required.has(key)) continue;
      if (prop.type === 'array') prop.default = [];
      else if (prop.type === 'object' && 'additionalProperties' in prop) prop.default = {};
    }
  }
  for (const value of Object.values(node)) applyPydanticDefaults(value);
};

const collectRefs = (node, acc) => {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, acc);
    return acc;
  }
  if (node && typeof node === 'object') {
    if (typeof node.$ref === 'string') {
      const name = refName(node.$ref);
      if (name !== 'TemplatedText') acc.add(name);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== '$ref') collectRefs(value, acc);
    }
  }
  return acc;
};

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const buildModels = (bundle) => {
  // A well-formed bundle carries a `$defs` object (the shared sub-shapes, incl.
  // TemplatedText) and a `documents` object. A bundle missing either is MALFORMED — fail
  // loudly with the real cause rather than silently treating it as an empty set of models.
  if (!isPlainObject(bundle) || !isPlainObject(bundle.documents)) {
    throw new Error(
      `contract bundle at ${BUNDLE_PATH} has no "documents" object — the bundle is malformed.`,
    );
  }
  if (!isPlainObject(bundle.$defs)) {
    throw new Error(
      `contract bundle at ${BUNDLE_PATH} has no "$defs" object — the bundle is malformed.`,
    );
  }
  const models = {};
  const documentNames = [];
  for (const [name, schema] of Object.entries(bundle.$defs)) {
    if (name !== 'TemplatedText') models[name] = schema;
  }
  for (const [name, schema] of Object.entries(bundle.documents)) {
    // A document that is only a `$ref` to a shared sub-shape IS that sub-shape.
    if (schema && typeof schema === 'object' && schema.$ref && Object.keys(schema).length === 1) {
      documentNames.push(refName(schema.$ref));
      continue;
    }
    documentNames.push(name);
    if (!(name in models)) models[name] = schema;
  }
  return { models, documentNames };
};

const topoOrder = (models, deps) => {
  const order = [];
  const state = {};
  const visit = (name) => {
    if (state[name] === 'done' || state[name] === 'active') return;
    state[name] = 'active';
    for (const dep of deps[name]) {
      if (dep !== name && models[dep]) visit(dep);
    }
    state[name] = 'done';
    order.push(name);
  };
  for (const name of Object.keys(models)) visit(name);
  return order;
};

export const generate = (rawBundle) => {
  const bundle = structuredClone(rawBundle);
  const { models, documentNames } = buildModels(bundle);
  for (const schema of Object.values(models)) applyPydanticDefaults(schema);
  const deps = {};
  for (const [name, schema] of Object.entries(models)) deps[name] = collectRefs(schema, new Set());

  const lines = [];
  lines.push('// DO NOT EDIT — generated from the platform contract JSON-schema bundle.');
  lines.push('// Source: packages/api-client/contract-schema/contract-schema.json');
  lines.push(`// Regenerate with: ${REGENERATE_COMMAND}`);
  lines.push('//');
  lines.push('// One zod const + inferred type per published served document and per shared');
  lines.push('// sub-shape. A templated-text field is the shared `templatedText` zod, never a');
  lines.push('// bare string, so a body can never drift back to `z.string()`.');
  lines.push("import { z } from 'zod';");
  lines.push('');
  lines.push("import { templatedText } from '../templated-text';");
  lines.push('');

  for (const name of topoOrder(models, deps)) {
    const expr = jsonSchemaToZod(models[name], {
      module: 'none',
      noImport: true,
      zodVersion: 4,
      withoutDescribes: true,
      parserOverride,
    }).replace(/z\.any\(\)/g, 'z.unknown()');
    const constName = camel(name);
    const recursive = deps[name].has(name);
    if (recursive) {
      // A self-referential shape must be lazy so the const can reference itself,
      // and needs an explicit type annotation (TypeScript cannot infer it).
      lines.push(`export const ${constName}: z.ZodType = z.lazy(() => ${expr});`);
    } else {
      lines.push(`export const ${constName} = ${expr};`);
    }
    lines.push(`export type ${name} = z.infer<typeof ${constName}>;`);
    lines.push('');
  }

  return { source: lines.join('\n'), documentNames };
};

const readBundle = () => JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'));

const main = () => {
  const check = process.argv.includes('--check');
  const { source } = generate(readBundle());
  if (check) {
    let committed;
    try {
      committed = readFileSync(OUTPUT_PATH, 'utf8');
    } catch (err) {
      // An absent or unreadable committed file is NOT drift — report the real cause as its
      // own failure, distinct from the drift message below.
      const cause = err instanceof Error ? err.message : String(err);
      console.error(
        `could not read the committed served-schemas.ts at ${OUTPUT_PATH}: ${cause}. ` +
          `Generate it with \`${REGENERATE_COMMAND}\` and commit the result.`,
      );
      process.exit(1);
    }
    if (committed !== source) {
      console.error(
        `served-schemas.ts is stale: it does not match a fresh generation from the ` +
          `vendored contract bundle. Regenerate with \`${REGENERATE_COMMAND}\` and commit ` +
          `the result.`,
      );
      process.exit(1);
    }
    console.log('served-schemas.ts is up to date with the vendored contract bundle.');
    return;
  }
  writeFileSync(OUTPUT_PATH, source);
  console.log(`Wrote ${OUTPUT_PATH}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
