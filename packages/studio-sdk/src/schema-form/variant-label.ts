/**
 * The names a union's variants are offered under. Each name is read from the variant's
 * own schema, so a union whose members carry no title still offers choices a reader can
 * tell apart: its discriminator tag, else its title, else the name of the definition it
 * refers to (a reference to the whole document reads "Same shape as the whole value"),
 * else the schema a single-member `allOf` wraps, else its constant or its allowed values,
 * else its members when it is a union, else a description of its shape ("Text", "Whole
 * number", "List of text", "Object with name, size"). Two variants that would read the
 * same are told apart by their position.
 */
import { resolveRef, scalarLabel, typeList, unionMembers } from './resolve';
import type { JsonSchema, JsonSchemaType } from './types';

/** How many allowed values or property names a shape description lists before "…". */
const LISTED = 3;

const STRING_FORMATS: Readonly<Record<string, string>> = {
  date: 'Date',
  'date-time': 'Date and time',
  time: 'Time',
  duration: 'Duration',
  email: 'Email address',
  uri: 'Link',
  url: 'Link',
  uuid: 'Identifier',
};

const TYPE_NAMES: Readonly<Record<JsonSchemaType, string>> = {
  string: 'Text',
  integer: 'Whole number',
  number: 'Number',
  boolean: 'True or false',
  null: 'None',
  array: 'List',
  object: 'Object',
};

/**
 * The name a reference reads under: its definition name as words (`MediaRef` and
 * `media_ref` both read "Media ref"), else the pointer itself when that name holds no
 * words. A reference is always named, never described again, so naming a schema that
 * refers to itself ends.
 */
function referenceName(ref: string): string {
  if (ref === '#') return 'Same shape as the whole value';
  const words = (ref.split('/').at(-1) ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words === '' ? ref : words.charAt(0).toUpperCase() + words.slice(1);
}

/** The first few of `items`, joined, with "…" when more follow. */
function listed(items: readonly string[]): string {
  const shown = items.slice(0, LISTED).join(', ');
  return items.length > LISTED ? `${shown}, …` : shown;
}

/**
 * A name, and whether it opens with words this module wrote (a shape, a definition
 * name read as words). Only those words are lower-cased where the name sits inside a
 * longer one; a title or a value keeps its own case ("List of URL", "List of text").
 */
interface Name {
  readonly text: string;
  readonly shaped: boolean;
}

function shaped(text: string): Name {
  return { text, shaped: true };
}

function verbatim(text: string): Name {
  return { text, shaped: false };
}

/** The form a name takes inside a longer one. */
function nested(name: Name): string {
  return name.shaped ? name.text.charAt(0).toLowerCase() + name.text.slice(1) : name.text;
}

/** Names read as alternatives: "Text or whole number". */
function alternatives(names: readonly Name[]): Name {
  const [first, ...others] = names;
  if (first === undefined) return shaped('Any value');
  return { text: [first.text, ...others.map(nested)].join(' or '), shaped: first.shaped };
}

function typeShape(type: JsonSchemaType, schema: JsonSchema, root: JsonSchema): Name {
  if (type === 'string' && schema.format !== undefined) {
    return shaped(STRING_FORMATS[schema.format] ?? TYPE_NAMES.string);
  }
  if (type === 'array' && schema.items !== undefined) {
    return shaped(`List of ${nested(schemaName(schema.items, root))}`);
  }
  if (type === 'object') {
    const names = Object.keys(schema.properties ?? {});
    if (names.length > 0) return shaped(`Object with ${listed(names)}`);
    const values = schema.additionalProperties;
    if (typeof values === 'object') return shaped(`Map of ${nested(schemaName(values, root))}`);
  }
  return shaped(TYPE_NAMES[type]);
}

/** The name one schema reads under, before variants are told apart. */
function schemaName(schema: JsonSchema, root: JsonSchema): Name {
  const resolved = resolveRef(schema, root);
  if (typeof resolved.title === 'string' && resolved.title !== '') return verbatim(resolved.title);
  if (typeof schema.$ref === 'string') return shaped(referenceName(schema.$ref));
  // A single-member `allOf` wraps the schema it holds, and the form draws that schema.
  const [wrapped, ...others] = resolved.allOf ?? [];
  if (wrapped !== undefined && others.length === 0) return schemaName(wrapped, root);
  if ('const' in resolved) return verbatim(scalarLabel(resolved.const));
  const values = resolved.enum ?? [];
  if (values.length === 1) return verbatim(scalarLabel(values[0]));
  if (values.length > 1) return shaped(`One of ${listed(values.map(scalarLabel))}`);
  const members = unionMembers(resolved);
  if (members !== undefined) {
    return alternatives(members.map((member) => schemaName(member, root)));
  }
  const types = typeList(resolved);
  if (types.length === 0) {
    return resolved.properties === undefined
      ? shaped('Any value')
      : typeShape('object', resolved, root);
  }
  return alternatives(types.map((type) => typeShape(type, resolved, root)));
}

/**
 * The name each of a union's `variants` is offered under, in order. A variant with a
 * discriminator `tags` entry reads as that tag; any other reads as its schema's name.
 * Names that two or more variants share gain the variant's position, "Text (2)", and
 * again while a name so gained still matches another, so every name differs.
 */
export function variantLabels(
  variants: readonly JsonSchema[],
  tags: readonly unknown[],
  root: JsonSchema,
): string[] {
  let names = variants.map((variant, index) => {
    const tag = tags[index];
    return tag === undefined ? schemaName(variant, root).text : scalarLabel(tag);
  });
  for (;;) {
    const counts = new Map<string, number>();
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
    if (names.every((name) => counts.get(name) === 1)) return names;
    names = names.map((name, index) =>
      (counts.get(name) ?? 0) > 1 ? `${name} (${String(index + 1)})` : name,
    );
  }
}
