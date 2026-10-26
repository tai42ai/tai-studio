// The canonical text form of a declaration in an api-extractor report, shared by the
// report parser (scripts/api-report-parse.mjs, which stores it) and the surface diff
// (scripts/api-surface-diff.mjs, which compares it).
//
// Comparison is over each line's CANONICAL form, so an EMISSION-ONLY reshape reads as
// no change: api-extractor emits an inferred object type's members, and a union's
// alternatives, in an order an internal refactor can reshuffle, and renders a type
// reference either bare (`Foo`) or through the namespace-import alias of its source
// module (`s.Foo`) — none of which alters the set of members or the identity of any
// type. Canonicalization collapses whitespace, sorts a top-level union's alternatives,
// and drops namespace-alias qualifiers (keeping the leaf name as the discriminator).
// A genuine change — a different member, a changed or removed type, a different leaf
// type name — still differs after canonicalization and keeps its classification.
//
// A parsed node's canonical text (nodeText) drops the same namespace-alias qualifiers
// and a member's trailing separator; literalAlternatives reads the literal alternatives
// of a type in that form.

import ts from 'typescript';

const collapse = (text) => text.replace(/\s+/g, ' ').trim();

// The indices of a single collapsed line at which a character satisfies `pred`,
// evaluated only at bracket depth 0 (across `()[]{}` and generic `<>`) and OUTSIDE
// string literals — so a separator nested in a generic, an object type, a parameter
// list, or a `'...'`/`"..."`/`` `...` `` literal is never seen as top-level. A `>`
// closing an arrow token (`=>`) is not a bracket.
function topLevelIndices(text, pred) {
  const out = [];
  let depth = 0;
  let quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{' || c === '<') {
      depth++;
    } else if (c === ')' || c === ']' || c === '}') {
      depth--;
    } else if (c === '>') {
      if (text[i - 1] !== '=') depth--;
    } else if (depth === 0 && pred(c, i)) {
      out.push(i);
    }
  }
  return out;
}

// Drop namespace-alias qualifiers from type references outside string literals:
// api-extractor renders a type either bare (`Foo`) or through the namespace-import
// alias it assigned that symbol's source module (`s.Foo`), and an internal refactor
// can flip one to the other without changing the type a consumer sees. Only the
// qualifier is removed; the leaf name — the discriminator — stays, so `s.Foo` and
// `Foo` fold together while `s.Foo -> s.Bar` (or any real leaf change) still differs.
// String literals (literal-type members, module specifiers) are copied verbatim, so
// a dotted module name inside quotes is never altered.
function stripQualifiers(text) {
  let out = '';
  let buf = '';
  let quote = '';
  const flush = () => {
    out += buf.replace(/[A-Za-z_$][\w$]*\./g, '');
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === quote && text[i - 1] !== '\\') quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      flush();
      out += c;
      quote = c;
      continue;
    }
    buf += c;
  }
  flush();
  return out;
}

// The index of the member/alias boundary on a collapsed line — the top-level colon of
// a `name: Type` member (or an index/call signature's `]: `/`): `), else a top-level
// standalone `=` of a `type X = ...` alias, else -1. Everything after it is the type
// whose union alternatives are order-insensitive.
function typeBoundary(line) {
  const colons = topLevelIndices(line, (c) => c === ':');
  if (colons.length) return colons[colons.length - 1];
  const eqs = topLevelIndices(line, (c, i) => c === '=' && line[i + 1] !== '>');
  return eqs.length ? eqs[eqs.length - 1] : -1;
}

// Canonicalize a single api-extractor line so two lines that describe the same member
// or type modulo EMISSION differences compare equal: whitespace collapsed, namespace
// qualifiers dropped, and the alternatives of a top-level union type sorted (union
// order carries no meaning). A genuine content change — a different member name, a
// changed/removed type, an added member, a different leaf type — still differs after
// canonicalization, so it keeps its classification.
function canonical(line) {
  const s = stripQualifiers(collapse(line));
  const boundary = typeBoundary(s);
  const head = boundary === -1 ? '' : s.slice(0, boundary + 1);
  let type = boundary === -1 ? s : s.slice(boundary + 1);
  const tail = type.match(/[;,]\s*$/);
  const suffix = tail ? type.slice(tail.index).trim() : '';
  if (tail) type = type.slice(0, tail.index);
  const bars = topLevelIndices(type, (c) => c === '|');
  if (bars.length === 0) return s;
  const members = [];
  let start = 0;
  for (const idx of [...bars, type.length]) {
    members.push(type.slice(start, idx).trim());
    start = idx + 1;
  }
  const sorted = members
    .filter((m) => m !== '')
    .sort()
    .join(' | ');
  return `${head ? `${head} ` : ''}${sorted}${suffix}`;
}

const normalize = (text) => canonical(text);

const unparenthesized = (node) => {
  let inner = node;
  while (ts.isParenthesizedTypeNode(inner)) inner = inner.type;
  return inner;
};

// A member's trailing `;`/`,` separator: api-extractor ends a member with one except
// the last member of a compact inline object type (`{ a: string }`), so it carries no
// meaning in a comparison.
const MEMBER_SEPARATOR = /[;,]$/;

// A node's text in the canonical comparison form: whitespace collapsed, namespace-alias
// qualifiers dropped (so `s.Foo` and `Foo` are the same type here as they are on a
// canonical line), and a trailing member separator removed.
const nodeText = (node, sf) =>
  stripQualifiers(collapse(node.getText(sf))).replace(MEMBER_SEPARATOR, '');

// The alternatives of a literal type or of a union whose alternatives are ALL literal
// types (string, number — a negative one included — boolean, null, or a template
// literal without substitutions), as a Set of their texts; null for any other type.
// Only such a type can widen additively by gaining alternatives.
function literalAlternatives(typeNode, sf) {
  if (!typeNode) return null;
  const type = unparenthesized(typeNode);
  const alternatives = ts.isUnionTypeNode(type) ? type.types.map(unparenthesized) : [type];
  const set = new Set();
  for (const alternative of alternatives) {
    if (!ts.isLiteralTypeNode(alternative)) return null;
    set.add(nodeText(alternative, sf));
  }
  return set;
}

export {
  canonical,
  collapse,
  literalAlternatives,
  MEMBER_SEPARATOR,
  nodeText,
  normalize,
  unparenthesized,
};
