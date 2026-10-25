// The generator's rules, each over a synthetic bundle and spec: the discriminated union over
// `$ref`s, the nullable, the enums, the document name dedupe, the Input/Output collapse, the
// version fields kept out of every generated file, and the route table with its `buildPath`.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { apiRoutes, buildPath } from '../src/generated/api-routes';
import { generate, OUTPUT_FILES } from './gen-schemas.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(resolve(here, path), 'utf8'));

const SHARED = {
  type: 'object',
  properties: { note: { type: 'string' } },
  required: ['note'],
  title: 'Shared',
};

/** A bundle with one plain document, one document over a shared `$def`, and one `$def`. */
const bundle = () => ({
  contract_version: '9.8.7',
  constants: { SAMPLE: 'value' },
  vectors: { sample: [{ input: 'a', output: 'b' }] },
  $defs: { Shared: SHARED, Helper: { type: 'object', properties: { x: { type: 'integer' } } } },
  documents: {
    Widget: {
      type: 'object',
      properties: { name: { type: 'string' }, shared: { $ref: '#/$defs/Shared' } },
      required: ['name', 'shared'],
      title: 'Widget',
    },
  },
});

/** A spec whose components mirror the bundle; `extra` adds or overrides components. */
const spec = (extra = {}) => ({
  openapi: '3.1.0',
  info: { title: 'synthetic', version: '6.5.4-sentinel' },
  paths: {
    '/api/widgets/{name}': {
      get: {
        operationId: 'get_api_widgets_name',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: { $ref: '#/components/schemas/Widget' } },
                  required: ['data'],
                },
              },
            },
          },
        },
      },
    },
    '/api/files/{file_path}/stat': {
      get: {
        operationId: 'get_api_files_file_path_stat',
        parameters: [
          {
            name: 'file_path',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            'x-tai42-converter': 'path',
          },
        ],
        responses: { 200: { content: { 'text/csv': {} } } },
      },
    },
  },
  components: {
    schemas: {
      Shared: SHARED,
      Widget: {
        type: 'object',
        properties: { name: { type: 'string' }, shared: { $ref: '#/components/schemas/Shared' } },
        required: ['name', 'shared'],
        title: 'Widget',
      },
      ...extra,
    },
  },
});

const left = { type: 'object', properties: { kind: { const: 'left' } }, required: ['kind'] };
const right = { type: 'object', properties: { kind: { const: 'right' } }, required: ['kind'] };

describe('a oneOf of $refs with a discriminator', () => {
  it('becomes z.discriminatedUnion over the member consts', () => {
    const { files } = generate(
      bundle(),
      spec({
        Left: left,
        Right: right,
        Either: {
          oneOf: [{ $ref: '#/components/schemas/Left' }, { $ref: '#/components/schemas/Right' }],
          discriminator: {
            propertyName: 'kind',
            mapping: { left: '#/components/schemas/Left', right: '#/components/schemas/Right' },
          },
        },
      }),
    );
    expect(files['openapi-schemas.ts']).toContain(
      'export const either = z.discriminatedUnion("kind", [left, right]);',
    );
  });
});

describe('an anyOf of one schema and null', () => {
  it("becomes the schema's .nullable(), keeping the default", () => {
    const { files } = generate(
      bundle(),
      spec({
        Maybe: {
          type: 'object',
          properties: { note: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null } },
        },
      }),
    );
    expect(files['openapi-schemas.ts']).toContain(
      'export const maybe = z.object({ "note": z.string().nullable().default(null) });',
    );
  });
});

describe('an enum', () => {
  it('a named enum component is its own const and type; an inline enum is z.enum in place', () => {
    const { files } = generate(
      bundle(),
      spec({
        Color: { type: 'string', enum: ['red', 'blue'], title: 'Color' },
        Paint: {
          type: 'object',
          properties: {
            color: { $ref: '#/components/schemas/Color' },
            finish: { type: 'string', enum: ['matte', 'gloss'] },
          },
          required: ['color', 'finish'],
        },
      }),
    );
    const out = files['openapi-schemas.ts'];
    expect(out).toContain('export const color = z.enum(["red","blue"]);');
    expect(out).toContain('export type Color = z.infer<typeof color>;');
    expect(out).toContain(
      'export const paint = z.object({ "color": color, "finish": z.enum(["matte","gloss"]) });',
    );
  });
});

describe('a component named after a contract document', () => {
  it('re-exports the served const when the schemas are equal', () => {
    const { files } = generate(bundle(), spec());
    expect(files['openapi-schemas.ts']).toContain('export const widget = served.widget;');
    expect(files['openapi-schemas.ts']).not.toContain('export const widget = z.');
  });

  it('throws when the schemas differ', () => {
    const drifted = spec();
    drifted.components.schemas.Widget.properties.extra = { type: 'string' };
    expect(() => generate(bundle(), drifted)).toThrow(
      'component Widget differs from the contract document Widget',
    );
  });

  it('equals a document whose reference names the sub-shape without a mode suffix', () => {
    const moded = spec({ 'Shared-Input': SHARED, 'Shared-Output': SHARED });
    delete moded.components.schemas.Shared;
    moded.components.schemas.Widget.properties.shared = {
      $ref: '#/components/schemas/Shared-Input',
    };
    const { files } = generate(bundle(), moded);
    expect(files['openapi-schemas.ts']).toContain('export const widget = served.widget;');
  });

  it('re-exports one const for both modes of the document', () => {
    const both = spec();
    both.components.schemas['Widget-Input'] = both.components.schemas.Widget;
    both.components.schemas['Widget-Output'] = structuredClone(both.components.schemas.Widget);
    delete both.components.schemas.Widget;
    both.paths['/api/widgets/{name}'].get.responses[200].content[
      'application/json'
    ].schema.properties.data = { $ref: '#/components/schemas/Widget-Output' };
    const source = generate(bundle(), both).files['openapi-schemas.ts'];
    expect(source.match(/export const widget = served\.widget;/g)).toHaveLength(1);
    expect(source).toContain('get_api_widgets_name: widget,');
  });

  it('a bundle $def name is generated as its own const', () => {
    const source = generate(bundle(), spec()).files['openapi-schemas.ts'];
    expect(source).toContain('export const shared = z.object(');
    expect(source).not.toContain('served.shared');
  });
});

describe('an X-Input / X-Output pair', () => {
  it('collapses to one const named without the suffix when the two are equal', () => {
    const source = generate(
      bundle(),
      spec({ 'Pair-Input': structuredClone(left), 'Pair-Output': structuredClone(left) }),
    ).files['openapi-schemas.ts'];
    expect(source).toContain('export const pair = z.object(');
    expect(source).not.toContain('pairInput');
    expect(source).not.toContain('pairOutput');
  });

  it('emits both when the two differ', () => {
    const source = generate(
      bundle(),
      spec({ 'Pair-Input': structuredClone(left), 'Pair-Output': structuredClone(right) }),
    ).files['openapi-schemas.ts'];
    expect(source).toContain('export const pairInput = z.object(');
    expect(source).toContain('export const pairOutput = z.object(');
  });

  it('emits both when a pair they reference differs', () => {
    const source = generate(
      bundle(),
      spec({
        'Inner-Input': structuredClone(left),
        'Inner-Output': structuredClone(right),
        'Outer-Input': {
          type: 'object',
          properties: { inner: { $ref: '#/components/schemas/Inner-Input' } },
        },
        'Outer-Output': {
          type: 'object',
          properties: { inner: { $ref: '#/components/schemas/Inner-Output' } },
        },
      }),
    ).files['openapi-schemas.ts'];
    expect(source).toContain('export const outerInput = z.object({ "inner": innerInput');
    expect(source).toContain('export const outerOutput = z.object({ "inner": innerOutput');
  });
});

describe('the version fields', () => {
  it('appear in no generated file', () => {
    const { files } = generate(bundle(), spec());
    expect(Object.keys(files)).toEqual(OUTPUT_FILES);
    for (const source of Object.values(files)) {
      expect(source).not.toContain('6.5.4-sentinel');
      expect(source).not.toContain('9.8.7');
    }
  });

  it('a version-only re-vendor regenerates nothing', () => {
    const vendoredBundle = readJson('../contract-schema/contract-schema.json');
    const vendoredSpec = readJson('../contract-schema/openapi.json');
    const baseline = generate(vendoredBundle, vendoredSpec).files;
    const bumpedBundle = { ...vendoredBundle, contract_version: '999.0.0' };
    const bumpedSpec = { ...vendoredSpec, info: { ...vendoredSpec.info, version: '999.0.0' } };
    expect(generate(bumpedBundle, bumpedSpec).files).toEqual(baseline);
  });
});

describe('the served constants and documents', () => {
  it('carry the bundle constants, vectors and each document with the $defs it reaches', () => {
    const source = generate(bundle(), spec()).files['served-schemas.ts'];
    expect(source).toContain('export const servedConstants = {\n  "SAMPLE": "value"\n} as const;');
    expect(source).toContain('export const servedVectors = {');
    expect(source).toMatch(/"Widget": \{\n {4}"\$defs": \{\n {6}"Shared": \{/);
    expect(source).not.toMatch(/"\$defs": \{[^}]*"Helper"/);
  });

  it('refuse a bundle without its constants', () => {
    const malformed = bundle();
    delete malformed.constants;
    expect(() => generate(malformed, spec())).toThrow('contract bundle has no "constants" object');
  });
});

describe('the route table', () => {
  it('holds every spec path under its operationId, with the path converter restored', () => {
    const source = generate(bundle(), spec()).files['api-routes.ts'];
    expect(source).toContain(
      'get_api_widgets_name: { method: "GET", path: "/api/widgets/{name}" },',
    );
    expect(source).toContain(
      'get_api_files_file_path_stat: { method: "GET", path: "/api/files/{file_path:path}/stat" },',
    );
  });

  it('holds every operation of the vendored spec', () => {
    const vendoredSpec = readJson('../contract-schema/openapi.json');
    const operations = Object.entries(vendoredSpec.paths).flatMap(([path, item]) =>
      Object.entries(item).map(([method, operation]) => [
        operation.operationId,
        method.toUpperCase(),
        path,
      ]),
    );
    expect(Object.keys(apiRoutes)).toHaveLength(operations.length);
    for (const [operationId, method, path] of operations) {
      expect(apiRoutes[operationId].method).toBe(method);
      expect(apiRoutes[operationId].path.replace(/:path\}/g, '}')).toBe(path);
    }
  });

  it('lists the segment-boundary prefixes that are not templates', () => {
    const source = generate(bundle(), spec()).files['api-routes.ts'];
    expect(source).toContain(
      'export const apiPathPrefixes = [\n  "/api",\n  "/api/files",\n  "/api/files/{file_path:path}",\n  "/api/widgets"\n] as const;',
    );
  });
});

describe('buildPath', () => {
  it('encodes a segment parameter, so a slash inside it is not a separator', () => {
    expect(buildPath('/api/conversations/{route_name}/threads', { route_name: 'a/b' })).toBe(
      '/api/conversations/a%2Fb/threads',
    );
  });

  it('keeps the separators of a path parameter, encoding each part', () => {
    expect(
      buildPath('/api/storage/resources/{resource_id:path}/stat', { resource_id: 'a b/c' }),
    ).toBe('/api/storage/resources/a%20b/c/stat');
  });

  it('keeps an empty part of a path parameter as typed', () => {
    expect(
      buildPath('/api/storage/resources/{resource_id:path}/stat', { resource_id: 'a//b' }),
    ).toBe('/api/storage/resources/a//b/stat');
  });

  it('throws on a `.` or `..` part of a path parameter', () => {
    const path = '/api/storage/resources/{resource_id:path}/stat';
    expect(() => buildPath(path, { resource_id: 'a/./b' })).toThrow("must not be '.' or '..'");
    expect(() => buildPath(path, { resource_id: '../b' })).toThrow("must not be '.' or '..'");
  });

  it('throws on a missing parameter', () => {
    expect(() => buildPath('/api/conversations/{route_name}/threads', {})).toThrow(
      'buildPath: missing param route_name for /api/conversations/{route_name}/threads',
    );
  });
});
