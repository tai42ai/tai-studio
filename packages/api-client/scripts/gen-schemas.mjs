// Generate the api-client's zod schemas, route table and served constants from the platform's
// two published artifacts.
//
// Inputs (vendored by hand with `schema:refresh`, never fetched here):
//   packages/api-client/contract-schema/contract-schema.json — the contract bundle;
//   packages/api-client/contract-schema/openapi.json         — the skeleton's OpenAPI artifact.
// Outputs, under packages/api-client/src/generated/:
//   served-schemas.ts  — one zod const + type per bundle document and shared sub-shape, the
//                        served constants, the conformance vectors and each document's raw JSON;
//   openapi-schemas.ts — one zod const + type per OpenAPI component, and `responseSchemas`, the
//                        const of each operation's `{"data": …}` success body;
//   api-routes.ts      — `apiRoutes` (operationId → method and path template), the path-prefix
//                        list, and `buildPath`.
//
// Run `pnpm --filter @tai42/api-client run schema:generate` to rewrite the outputs, or
// `... schema:check` to fail when a committed output is stale.
//
// Rules the generator applies:
// - A field the platform marks `x-tai42-templated-text`, and every `$ref` to the TemplatedText
//   sub-shape, maps to the shared `templatedText` zod (never a bare string).
// - A `oneOf` of `$ref`s with a `discriminator` becomes `z.discriminatedUnion`.
// - An `anyOf` of one schema and `null` becomes that schema's `.nullable()`.
// - An OpenAPI component named `X`, `X-Input` or `X-Output`, where `X` is a bundle document,
//   re-exports the bundle const when the two JSON schemas are equal once every `$ref` is compared
//   by its target name with one trailing `-Input`/`-Output` removed; unequal schemas throw.
// - An `X-Input`/`X-Output` pair whose schemas are equal by the same comparison (and whose
//   references are equal too) collapses to one const named `X`; otherwise both are emitted.
// - The artifacts' version fields are never written into a generated file.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { jsonSchemaToZod, parseSchema } from 'json-schema-to-zod';

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE_PATH = resolve(here, '../contract-schema/contract-schema.json');
const OPENAPI_PATH = resolve(here, '../contract-schema/openapi.json');
const OUTPUT_DIR = resolve(here, '../src/generated');
const REGENERATE_COMMAND = 'pnpm --filter @tai42/api-client run schema:generate';

const SHARED_TEMPLATED_TEXT = 'templatedText';
const TEMPLATED_TEXT = 'TemplatedText';
const BUNDLE_REF = /^#\/\$defs\/(.+)$/;
const OPENAPI_REF = /^#\/components\/schemas\/(.+)$/;
const MODE_SUFFIX = /-(Input|Output)$/;

/** `HookSubject-Input` → `HookSubjectInput`: the schema name with its separators removed. */
const typeName = (name) =>
  name.replace(/[^0-9A-Za-z]+(.)?/g, (_m, next) => (next ?? '').toUpperCase());

/** `hookSubject-Input` → `HookSubjectInput`: the PascalCase type name of a schema or const name. */
const pascal = (name) => {
  const type = typeName(name);
  return type.charAt(0).toUpperCase() + type.slice(1);
};

/** `HookSubject-Input` → `hookSubjectInput`: the const name of a schema name. */
const constName = (name) => {
  const type = typeName(name);
  return type.charAt(0).toLowerCase() + type.slice(1);
};

const baseName = (name) => name.replace(MODE_SUFFIX, '');

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const bundleRefName = (ref) => {
  const match = BUNDLE_REF.exec(ref);
  if (!match) throw new Error(`Unsupported $ref (only #/$defs/* is published): ${ref}`);
  return match[1];
};

const openapiRefName = (ref) => {
  const match = OPENAPI_REF.exec(ref);
  if (!match)
    throw new Error(`Unsupported $ref (only #/components/schemas/* is published): ${ref}`);
  return match[1];
};

/** A copy of `node` with keys sorted at every level, so two schemas compare by structure. */
const canonical = (node) => {
  if (Array.isArray(node)) return node.map(canonical);
  if (!isPlainObject(node)) return node;
  return Object.fromEntries(
    Object.keys(node)
      .sort()
      .map((key) => [key, canonical(node[key])]),
  );
};

/**
 * `schema` with every reference — a `$ref` and a discriminator `mapping` target — replaced by its
 * target name, one trailing mode suffix removed.
 */
const normalizeRefs = (node, refName) => {
  if (Array.isArray(node)) return node.map((item) => normalizeRefs(item, refName));
  if (!isPlainObject(node)) return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      out[key] = baseName(refName(value));
    } else if (key === 'discriminator' && isPlainObject(value) && isPlainObject(value.mapping)) {
      out[key] = {
        ...value,
        mapping: Object.fromEntries(
          Object.entries(value.mapping).map(([tag, ref]) => [tag, baseName(refName(ref))]),
        ),
      };
    } else {
      out[key] = normalizeRefs(value, refName);
    }
  }
  return out;
};

const sameSchema = (left, right) =>
  JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

const collectRefs = (node, refName, acc) => {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refName, acc);
    return acc;
  }
  if (isPlainObject(node)) {
    if (typeof node.$ref === 'string') acc.add(refName(node.$ref));
    for (const [key, value] of Object.entries(node)) {
      if (key !== '$ref') collectRefs(value, refName, acc);
    }
  }
  return acc;
};

// A pydantic list/dict field with a default_factory is neither `required` nor carries a static
// `default` in its JSON schema, yet it is always present in a served payload and callers treat it
// as present. Give every non-required, non-nullable bare array/dict property the empty default
// the platform fills, so the generated field is `[]`/`{}` (always present) rather than optional.
const applyPydanticDefaults = (node) => {
  if (Array.isArray(node)) {
    for (const item of node) applyPydanticDefaults(item);
    return;
  }
  if (!isPlainObject(node)) return;
  if (node.type === 'object' && isPlainObject(node.properties)) {
    const required = new Set(Array.isArray(node.required) ? node.required : []);
    for (const [key, prop] of Object.entries(node.properties)) {
      if (!isPlainObject(prop)) continue;
      if ('default' in prop || required.has(key)) continue;
      if (prop.type === 'array') prop.default = [];
      else if (prop.type === 'object' && 'additionalProperties' in prop) prop.default = {};
    }
  }
  for (const value of Object.values(node)) applyPydanticDefaults(value);
};

/**
 * The parser override shared by both generators. json-schema-to-zod does not resolve `$ref`
 * itself, and detects a discriminated union only when every member is an inline object with a
 * `const` tag; this seam (a) points every reference at its const, (b) maps a templated-text
 * field to the shared `templatedText` zod, (c) emits a `oneOf` of `$ref`s with a
 * `discriminator` as `z.discriminatedUnion` and (d) emits an `anyOf` of one schema and `null`
 * as `.nullable()`, so a consumer reaches the inner schema with `.unwrap()`.
 */
const makeParserOverride = (refConst) => (schema, refs) => {
  if (!isPlainObject(schema)) return undefined;
  if (typeof schema.$ref === 'string') {
    const base = refConst(schema.$ref);
    // A `$ref` property may carry its own `default` (a pydantic field default over a referenced
    // model). The override replaces the whole node, so json-schema-to-zod never sees the sibling
    // `default` to apply it; carry it here. The field is then optional on input and always present
    // on output — exactly a defaulted field.
    if ('default' in schema) return `${base}.default(${JSON.stringify(schema.default)})`;
    return base;
  }
  if ('x-tai42-templated-text' in schema) return SHARED_TEMPLATED_TEXT;
  if (
    Array.isArray(schema.oneOf) &&
    isPlainObject(schema.discriminator) &&
    typeof schema.discriminator.propertyName === 'string' &&
    schema.oneOf.length > 0 &&
    schema.oneOf.every((member) => isPlainObject(member) && typeof member.$ref === 'string')
  ) {
    const members = schema.oneOf.map((member) => refConst(member.$ref)).join(', ');
    const union = `z.discriminatedUnion(${JSON.stringify(schema.discriminator.propertyName)}, [${members}])`;
    return withMeta(schema, union);
  }
  if (Array.isArray(schema.anyOf) && schema.anyOf.length === 2) {
    const nonNull = schema.anyOf.filter(
      (member) =>
        !(isPlainObject(member) && member.type === 'null' && Object.keys(member).length === 1),
    );
    if (nonNull.length === 1) {
      const index = schema.anyOf.indexOf(nonNull[0]);
      const inner = parseSchema(nonNull[0], { ...refs, path: [...refs.path, 'anyOf', index] });
      return withMeta(schema, `${inner}.nullable()`);
    }
  }
  return undefined;
};

/** `expr` with the node's own `default` and `readOnly` applied, as json-schema-to-zod would. */
const withMeta = (schema, expr) => {
  let out = expr;
  if (schema.default !== undefined) out += `.default(${JSON.stringify(schema.default)})`;
  if (schema.readOnly) out += '.readonly()';
  return out;
};

/** The const declarations of `models` (name → schema) in dependency order. */
const emitConsts = (models, refName, refConst, localName) => {
  const parserOverride = makeParserOverride(refConst);
  const deps = {};
  for (const [name, schema] of Object.entries(models)) {
    deps[name] = collectRefs(schema, refName, new Set());
  }
  const order = [];
  const state = {};
  const visit = (name) => {
    if (state[name] === 'done' || state[name] === 'active') return;
    state[name] = 'active';
    for (const dep of [...deps[name]].sort()) {
      if (dep !== name && models[dep]) visit(dep);
    }
    state[name] = 'done';
    order.push(name);
  };
  for (const name of Object.keys(models).sort()) visit(name);

  const lines = [];
  for (const name of order) {
    const expr = jsonSchemaToZod(models[name], {
      module: 'none',
      noImport: true,
      zodVersion: 4,
      withoutDescribes: true,
      parserOverride,
    }).replace(/z\.any\(\)/g, 'z.unknown()');
    const local = localName(name);
    if (deps[name].has(name)) {
      // A self-referential shape must be lazy so the const can reference itself, and needs an
      // explicit type annotation (TypeScript cannot infer it).
      lines.push(`export const ${local}: z.ZodType = z.lazy(() => ${expr});`);
    } else {
      lines.push(`export const ${local} = ${expr};`);
    }
    lines.push(`export type ${pascal(local)} = z.infer<typeof ${local}>;`);
    lines.push('');
  }
  return lines;
};

// ---------------------------------------------------------------------------
// The contract bundle
// ---------------------------------------------------------------------------

const readBundleModels = (bundle) => {
  // A well-formed bundle carries `$defs` (the shared sub-shapes, incl. TemplatedText),
  // `documents`, `constants` and `vectors` objects. A bundle missing one is MALFORMED — fail
  // loudly with the real cause rather than silently treating it as empty.
  for (const key of ['documents', '$defs', 'constants', 'vectors']) {
    if (!isPlainObject(bundle?.[key])) {
      throw new Error(`contract bundle has no "${key}" object — the bundle is malformed.`);
    }
  }
  const models = {};
  // Each document name → the name of the const that holds it.
  const documentConsts = {};
  for (const [name, schema] of Object.entries(bundle.$defs)) {
    if (name !== TEMPLATED_TEXT) models[name] = schema;
  }
  for (const [name, schema] of Object.entries(bundle.documents)) {
    // A document that is only a `$ref` to a shared sub-shape IS that sub-shape.
    if (
      isPlainObject(schema) &&
      typeof schema.$ref === 'string' &&
      Object.keys(schema).length === 1
    ) {
      documentConsts[name] = bundleRefName(schema.$ref);
      continue;
    }
    documentConsts[name] = name;
    if (!(name in models)) models[name] = schema;
  }
  return { models, documentConsts };
};

/** Each document with the `$defs` it reaches, so a form can resolve every `#/$defs/*` within it. */
const selfContainedDocuments = (bundle) => {
  const out = {};
  for (const [name, schema] of Object.entries(bundle.documents)) {
    const reached = new Set();
    const frontier = [...collectRefs(schema, bundleRefName, new Set())];
    while (frontier.length > 0) {
      const ref = frontier.pop();
      if (reached.has(ref) || !(ref in bundle.$defs)) continue;
      reached.add(ref);
      frontier.push(...collectRefs(bundle.$defs[ref], bundleRefName, new Set()));
    }
    const defs = Object.fromEntries([...reached].sort().map((ref) => [ref, bundle.$defs[ref]]));
    out[name] = reached.size > 0 ? { ...schema, $defs: defs } : schema;
  }
  return out;
};

const generateServed = (bundle) => {
  const { models, documentConsts } = readBundleModels(bundle);
  for (const schema of Object.values(models)) applyPydanticDefaults(schema);
  const refConst = (ref) => {
    const name = bundleRefName(ref);
    return name === TEMPLATED_TEXT ? SHARED_TEMPLATED_TEXT : constName(name);
  };
  const lines = [
    '// DO NOT EDIT — generated from the platform contract JSON-schema bundle.',
    '// Source: packages/api-client/contract-schema/contract-schema.json',
    `// Regenerate with: ${REGENERATE_COMMAND}`,
    '//',
    '// One zod const + inferred type per published served document and per shared',
    '// sub-shape. A templated-text field is the shared `templatedText` zod, never a',
    '// bare string, so a body can never drift back to `z.string()`.',
    "import { z } from 'zod';",
    '',
    "import { templatedText } from '../templated-text';",
    '',
    ...emitConsts(models, bundleRefName, refConst, constName),
    '/** The platform constants the contract serves, read instead of re-spelled. */',
    `export const servedConstants = ${JSON.stringify(canonical(bundle.constants), null, 2)} as const;`,
    '',
    '/** The conformance vectors of the platform rules a browser mirrors. */',
    `export const servedVectors = ${JSON.stringify(canonical(bundle.vectors), null, 2)} as const;`,
    '',
    '/** Each served document as JSON Schema, with the `$defs` it references. */',
    `export const servedDocumentsJson = ${JSON.stringify(canonical(selfContainedDocuments(bundle)), null, 2)} as const;`,
    '',
  ];
  return { source: lines.join('\n'), documentConsts };
};

// ---------------------------------------------------------------------------
// The OpenAPI artifact
// ---------------------------------------------------------------------------

/** The bundle schema a document name resolves to (a `$ref`-only document is its sub-shape). */
const bundleDocumentSchema = (bundle, name) => {
  const schema = bundle.documents[name];
  if (
    isPlainObject(schema) &&
    typeof schema.$ref === 'string' &&
    Object.keys(schema).length === 1
  ) {
    return bundle.$defs[bundleRefName(schema.$ref)];
  }
  return schema;
};

/**
 * How each component is emitted: `{ local, served? }` — the local const name, and for a
 * component re-exported from the bundle the served const it aliases.
 */
const planComponents = (components, bundle, documentConsts) => {
  const names = Object.keys(components).filter((name) => baseName(name) !== TEMPLATED_TEXT);
  const plan = {};

  // Bundle documents: re-exported when equal, refused when not.
  for (const name of names) {
    const base = baseName(name);
    if (!(base in bundle.documents)) continue;
    const component = normalizeRefs(components[name], openapiRefName);
    const document = normalizeRefs(bundleDocumentSchema(bundle, base), bundleRefName);
    if (!sameSchema(component, document)) {
      throw new Error(`component ${name} differs from the contract document ${base}`);
    }
    plan[name] = { local: constName(base), served: constName(documentConsts[base]) };
  }

  // Input/Output pairs: collapsed when both modes are equal, transitively.
  const pairs = new Set(
    names
      .filter((name) => name.endsWith('-Input') && !(name in plan))
      .map(baseName)
      .filter((base) => `${base}-Output` in components),
  );
  const split = new Set(
    [...pairs].filter(
      (base) =>
        !sameSchema(
          normalizeRefs(components[`${base}-Input`], openapiRefName),
          normalizeRefs(components[`${base}-Output`], openapiRefName),
        ),
    ),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const base of pairs) {
      if (split.has(base)) continue;
      const refs = [
        ...collectRefs(components[`${base}-Input`], openapiRefName, new Set()),
        ...collectRefs(components[`${base}-Output`], openapiRefName, new Set()),
      ];
      if (refs.some((ref) => split.has(baseName(ref)))) {
        split.add(base);
        changed = true;
      }
    }
  }
  for (const name of names) {
    if (name in plan) continue;
    const base = baseName(name);
    plan[name] = { local: pairs.has(base) && !split.has(base) ? constName(base) : constName(name) };
  }

  // One const per local name: two components claiming one name is a generator error.
  const claimed = new Map();
  for (const [name, { local }] of Object.entries(plan)) {
    const owner = claimed.get(local);
    if (owner !== undefined && baseName(owner) !== baseName(name)) {
      throw new Error(`components ${owner} and ${name} both generate the const ${local}`);
    }
    claimed.set(local, name);
  }
  return plan;
};

/** The `{"data": {$ref}}` component of an operation's success body, or undefined. */
const envelopeRef = (operation) => {
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    if (!status.startsWith('2')) continue;
    const schema = response?.content?.['application/json']?.schema;
    const data = schema?.properties?.data;
    if (schema?.type === 'object' && typeof data?.$ref === 'string') return data.$ref;
  }
  return undefined;
};

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

const operationsOf = (spec) => {
  const operations = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!HTTP_METHODS.has(method)) continue;
      if (typeof operation?.operationId !== 'string') {
        throw new Error(`operation ${method.toUpperCase()} ${path} has no operationId`);
      }
      operations.push({ path, method: method.toUpperCase(), operation });
    }
  }
  return operations.sort((a, b) => a.operation.operationId.localeCompare(b.operation.operationId));
};

const generateOpenapi = (spec, bundle, documentConsts) => {
  if (!isPlainObject(spec?.paths) || !isPlainObject(spec?.components?.schemas)) {
    throw new Error(
      'OpenAPI artifact has no "paths" or "components.schemas" object — it is malformed.',
    );
  }
  const plan = planComponents(spec.components.schemas, bundle, documentConsts);
  const components = structuredClone(spec.components.schemas);
  for (const schema of Object.values(components)) applyPydanticDefaults(schema);
  const refConst = (ref) => {
    const name = openapiRefName(ref);
    if (baseName(name) === TEMPLATED_TEXT) return SHARED_TEMPLATED_TEXT;
    const entry = plan[name];
    if (entry === undefined) throw new Error(`$ref ${ref} names no published component`);
    return entry.local;
  };

  // One model per local const: the aliases are emitted apart, a collapsed pair once.
  const aliases = new Map();
  const models = {};
  for (const [name, entry] of Object.entries(plan)) {
    if (entry.served !== undefined) {
      aliases.set(entry.local, entry.served);
      continue;
    }
    if (entry.local in models) continue;
    models[entry.local] = components[name];
  }
  // References point at component names; the topological walk needs local names.
  const localRef = (ref) => {
    const name = openapiRefName(ref);
    return baseName(name) === TEMPLATED_TEXT ? TEMPLATED_TEXT : (plan[name]?.local ?? name);
  };

  const lines = [
    '// DO NOT EDIT — generated from the skeleton OpenAPI artifact.',
    '// Source: packages/api-client/contract-schema/openapi.json',
    `// Regenerate with: ${REGENERATE_COMMAND}`,
    '//',
    '// One zod const + inferred type per OpenAPI component. A component that is a contract',
    '// document re-exports the served const; `responseSchemas` maps each operation whose',
    '// success body is the `{"data": …}` envelope to the const of its `data`.',
    "import { z } from 'zod';",
    '',
    "import { templatedText } from '../templated-text';",
    "import * as served from './served-schemas';",
    '',
  ];
  for (const [local, servedConst] of [...aliases].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`export const ${local} = served.${servedConst};`);
    lines.push(`export type ${pascal(local)} = served.${pascal(servedConst)};`);
    lines.push('');
  }
  lines.push(...emitConsts(models, localRef, refConst, (local) => local));
  lines.push('/** The const of each operation\'s `{"data": …}` success body, by operationId. */');
  lines.push('export const responseSchemas = {');
  for (const { operation } of operationsOf(spec)) {
    const ref = envelopeRef(operation);
    if (ref !== undefined) lines.push(`  ${operation.operationId}: ${refConst(ref)},`);
  }
  lines.push('} as const;');
  lines.push('');
  return lines.join('\n');
};

/** Every `/`-boundary proper prefix of every template, sorted, without duplicates. */
const pathPrefixes = (templates) => {
  const prefixes = new Set();
  for (const template of templates) {
    const segments = template.split('/');
    for (let end = 2; end < segments.length; end += 1)
      prefixes.add(segments.slice(0, end).join('/'));
  }
  for (const template of templates) prefixes.delete(template);
  return [...prefixes].sort();
};

const generateRoutes = (spec) => {
  const operations = operationsOf(spec);
  const lines = [
    '// DO NOT EDIT — generated from the skeleton OpenAPI artifact.',
    '// Source: packages/api-client/contract-schema/openapi.json',
    `// Regenerate with: ${REGENERATE_COMMAND}`,
    '//',
    "// The platform's core routes by operationId. A placeholder written `{name:path}` matches",
    '// across `/` separators (the server names its converter on the parameter).',
    "import { encodeSegment } from '../http';",
    '',
    'export const apiRoutes = {',
  ];
  const templates = new Set();
  for (const { path, method, operation } of operations) {
    const converters = new Map(
      (operation.parameters ?? [])
        .filter(
          (parameter) => parameter?.in === 'path' && parameter['x-tai42-converter'] !== undefined,
        )
        .map((parameter) => [parameter.name, parameter['x-tai42-converter']]),
    );
    const template = path.replace(/\{([^}]+)\}/g, (_m, name) =>
      converters.has(name) ? `{${name}:${converters.get(name)}}` : `{${name}}`,
    );
    templates.add(template);
    lines.push(
      `  ${operation.operationId}: { method: ${JSON.stringify(method)}, path: ${JSON.stringify(template)} },`,
    );
  }
  lines.push('} as const;');
  lines.push('');
  lines.push('export type ApiOperationId = keyof typeof apiRoutes;');
  lines.push("export type ApiPathTemplate = (typeof apiRoutes)[ApiOperationId]['path'];");
  lines.push('');
  lines.push(
    '/** Every `/`-boundary proper prefix of a route template that is not itself a template. */',
  );
  lines.push(
    `export const apiPathPrefixes = ${JSON.stringify(pathPrefixes([...templates]), null, 2)} as const;`,
  );
  lines.push('export type ApiPathPrefix = (typeof apiPathPrefixes)[number];');
  lines.push('');
  lines.push('/**');
  lines.push(
    ' * `template` with each `{name}` replaced by the encoded `params[name]`. A `{name:path}`',
  );
  lines.push(' * placeholder keeps the `/` separators of its value, each part encoded. A missing');
  lines.push(' * parameter throws.');
  lines.push(' */');
  lines.push(
    'export function buildPath(template: ApiPathTemplate, params: Record<string, string>): string {',
  );
  lines.push(
    '  return template.replace(/\\{([^}:]+)(:path)?\\}/g, (_match, name: string, multi?: string) => {',
  );
  lines.push('    const value = params[name];');
  lines.push(
    '    if (value === undefined) throw new Error(`buildPath: missing param ${name} for ${template}`);',
  );
  lines.push(
    "    return multi ? value.split('/').map(encodeSegment).join('/') : encodeSegment(value);",
  );
  lines.push('  });');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
};

// ---------------------------------------------------------------------------

export const OUTPUT_FILES = ['served-schemas.ts', 'openapi-schemas.ts', 'api-routes.ts'];

export const generate = (rawBundle, rawSpec) => {
  const bundle = structuredClone(rawBundle);
  const spec = structuredClone(rawSpec);
  const { source: served, documentConsts } = generateServed(bundle);
  return {
    files: {
      'served-schemas.ts': served,
      'openapi-schemas.ts': generateOpenapi(spec, rawBundle, documentConsts),
      'api-routes.ts': generateRoutes(spec),
    },
    documentNames: Object.values(documentConsts),
  };
};

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const main = () => {
  const check = process.argv.includes('--check');
  const { files } = generate(readJson(BUNDLE_PATH), readJson(OPENAPI_PATH));
  if (!check) {
    for (const [name, source] of Object.entries(files)) {
      writeFileSync(resolve(OUTPUT_DIR, name), source);
      console.log(`Wrote ${resolve(OUTPUT_DIR, name)}`);
    }
    return;
  }
  const stale = [];
  for (const [name, source] of Object.entries(files)) {
    const path = resolve(OUTPUT_DIR, name);
    let committed;
    try {
      committed = readFileSync(path, 'utf8');
    } catch (err) {
      // An absent or unreadable committed file is NOT drift — report the real cause as its own
      // failure, distinct from the drift message below.
      const cause = err instanceof Error ? err.message : String(err);
      console.error(
        `could not read the committed ${name} at ${path}: ${cause}. ` +
          `Generate it with \`${REGENERATE_COMMAND}\` and commit the result.`,
      );
      process.exit(1);
    }
    if (committed !== source) stale.push(name);
  }
  if (stale.length > 0) {
    console.error(
      `${stale.join(', ')} ${stale.length === 1 ? 'is' : 'are'} stale: not a fresh generation from the ` +
        `vendored artifacts. Regenerate with \`${REGENERATE_COMMAND}\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log('The generated files are up to date with the vendored artifacts.');
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
