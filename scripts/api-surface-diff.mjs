// The public-API surface diff of two parsed api-extractor reports
// (scripts/api-report-parse.mjs): list every change between an old and a new surface
// that breaks a consumer. scripts/api-gate.mjs judges that list against a release's
// version bump.
//
// The guiding rule is industry-standard semver for a TypeScript library: a PURELY
// ADDITIVE surface change is a minor, and only a removal or a change to something
// that already existed is breaking. Two rules decide what is additive.
//
// LINES. A variable/type/function slot whose api.md text changed is compared by its
// member LINES first: when every old line survives and the delta is only whole new
// lines, it is additive and non-breaking — whatever those lines hold, a new REQUIRED
// member or param line included (a new member added to a client object, an exported
// object type, or an inline function-signature return shape; a new param line). An
// old line with no identical survivor must be matched by a new line that is the old
// one grown only by the three shapes below. An interface/class member, and the head of
// an interface/class declaration, are compared whole by those shapes alone, never by
// lines; a function overload survives by either rule.
//
// SHAPES. Three shapes of change are ADDITIVE: a literal type or all-literal union
// (string, number, boolean, null literals) widened with more literal alternatives
// (`| "x"`); an OPTIONAL property (`name?: T`) added inside an inline object type; and
// OPTIONAL params (`name?: T`) appended at the end of a parameter list. Each is judged
// on the parsed declaration: a changed line, member, overload or declaration head is
// parsed as the member or statement it is, and the new one must be the old one grown
// only by those shapes, at any depth (a type argument, an array element, a parameter's
// type, a return type), everything else identical. Within a line, member, overload or
// head so compared, an optional param inserted before an existing one, an appended REST
// param, a param made required, a REQUIRED property added inside an inline object type
// (which the diff cannot judge safe without an input/output notion), a literal joined to
// a NON-literal type (`number | "auto"`), a type parameter added (with a default or
// not), or any removed, renamed or retyped part errs breaking; so does a line, member,
// overload or head the parser rejects.
//
// Comparison is over each line's CANONICAL form (scripts/api-canonical-text.mjs), so an
// EMISSION-ONLY reshape (members or union alternatives reordered, a type reference
// rendered bare or through a namespace-import alias) reads as no change. The additive
// comparison of parsed declarations folds the same emission differences, and reads a
// union's alternatives in any order at any depth.
//
// Export status is judged once for every kind of declaration, at the top level and
// inside a namespace alike, and apart from the declaration's text: `export` dropped
// removes a name consumers import (breaking, like a removed symbol), and so does a
// named export made default-only (`export default` exports the default slot, never the
// name); `export` added, or a default export added beside what was there, is a new
// export (non-breaking), the rest of the declaration still compared as below. A
// default export is the name it points at, whether written inline
// (`export default function f`) or apart (`export default f`), so moving between the
// two forms is no change; only a default re-pointed or dropped is. `declare` is never
// compared: in a declaration file every declaration is ambient.
//
// A variable's declaration keyword is judged apart from its text, by the kind of
// block it sits in: a module's own top level, a UMD module's top level (one with
// `export as namespace`), a namespace (a dotted one included), a global block
// (`declare global`, or `global` inside `declare module "x"`), or `declare module
// "x"`.
// - `const` turned `let` or `var` is breaking in every block: `const` alone allows a
//   literal initializer (`const a = "x"`, typed `"x"`) and a `unique symbol` type,
//   which readers rely on.
// - `let` or `var` turned `const` is breaking at a UMD module's top level, in a
//   namespace and in a global block, where consumers assign the member (`L.a = …`,
//   `N.a = …`).
// - `var` turned `let` or `const` is breaking in a namespace, in a global block and in
//   `declare module "x"`, where a consumer's augmentation can redeclare a `var` (and a
//   global `var` is read through `globalThis`).
// - `let` turned `var` is breaking in a global block, where a `let` stays narrowed
//   inside a callback (`if (typeof g === "string") f(() => g.length)`) and a `var` does
//   not; in every other block that narrowing fails under all three keywords.
// - Any other change between `let`, `var` and `const` is no break: at a module's own
//   top level every importer reads a variable as read-only and none can redeclare it,
//   and a `declare module "x"` member is read-only to its importers too.
// - A keyword the diff does not know (`using`) fails closed: any change to or from it
//   reads as breaking.
//
// Breaking classes: a removed symbol, an `export` dropped from a declaration, a
// removed, added or NON-additively changed class constructor, a removed or
// NON-additively changed interface/class member (named or an index/call/construct
// signature), a NON-additive change to an interface or class declaration's own
// modifiers (a class made or unmade `abstract`), type parameters or heritage
// clauses (`extends`/`implements`), a member turned from optional to required, a
// new REQUIRED member, a function or method overload removed or changed
// NON-additively, a removed/changed enum member, an enum made `const` (a
// `const enum` allows only member access, and none at all from a declaration file
// under `isolatedModules`), a removed/changed namespace member, a variable keyword
// change that breaks consumers in its block (as above), a re-export dropped or
// re-pointed at a different local symbol, source module or namespace (or narrowed
// to type-only), a default export dropped or re-pointed, a type alias's type
// parameters changed NON-additively, and a non-additive change to a type alias.
// Non-breaking changes — a new export (a new declaration, or `export` added to an
// existing one), `const` dropped from an enum (a plain enum allows every use a
// `const enum` did), a variable keyword change that breaks no consumer in its
// block, a new optional member, a member added to a variable/type object or an
// overload's inline shape (an additive superset of the old member lines), a member,
// member line or overload grown only by the three additive shapes, an interface or
// class member turned from required to optional (inside an inline object type that
// flip re-renders the member's line and reads as breaking — the diff errs strict
// there), an added overload, an added enum member, a string-literal union widened
// with more members. A declaration TypeScript cannot parse is never judged additive, so
// any change to it reads as breaking; so does the unparsed text the parser keeps for a
// line TypeScript rejects, added, dropped or changed anywhere in such a line. A report
// the parser cannot read throws GateError before any comparison; the gate never passes a
// release on a classification it could not compute.

import ts from 'typescript';

import {
  canonical,
  collapse,
  literalAlternatives,
  MEMBER_SEPARATOR,
  nodeText,
  normalize,
  unparenthesized,
} from './api-canonical-text.mjs';

// The multiset of canonicalized, non-empty lines of a declaration's raw (multi-line)
// api-extractor text, as a map from each canonical line to the collapsed source lines
// that render it. api-extractor renders one member per line, so the lines ARE the
// members; keeping every source line keeps two members that happen to render to the
// same line distinct (removing one drops the count). Lines are keyed canonically, so a
// pure reshape (members reordered, a union's alternatives reordered, a type reference
// requalified) yields the same multiset while any real member change alters it. The
// source lines are kept for the additive comparison, which parses them.
function lineMultiset(text) {
  const map = new Map();
  for (const raw of text.split('\n')) {
    const line = canonical(raw);
    if (line === '') continue;
    const sources = map.get(line) ?? [];
    sources.push(collapse(raw));
    map.set(line, sources);
  }
  return map;
}

// Parse one declaration fragment as the shape it is: an interface/object-type member
// (`name: T;`, `name(a: A): T;`, `[k: string]: T;`), a class member (`static x: T;`,
// `constructor(a: A);`), or a top-level statement (`export declare function f(): T;`).
// The shape is chosen by the caller, never guessed by trying: a member line such as
// `a: number;` also parses as a labeled statement. Returns { node, sf }, or null when
// the text is not exactly one syntactically clean fragment of that shape — a partial
// line of a multi-line declaration (`c: {`, `}): void;`), or text TypeScript rejects.
function parseFragment(text, shape) {
  const source =
    shape === 'member'
      ? `interface _ {\n${text}\n}`
      : shape === 'class-member'
        ? `declare class _ {\n${text}\n}`
        : text;
  const { diagnostics } = ts.transpileModule(source, {
    reportDiagnostics: true,
    fileName: '_.ts',
    compilerOptions: { noResolve: true, target: ts.ScriptTarget.Latest },
  });
  if (diagnostics.length) return null;
  const sf = ts.createSourceFile('_.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sf.statements.length !== 1) return null;
  const statement = sf.statements[0];
  if (shape === 'statement') return { node: statement, sf };
  if (!ts.isInterfaceDeclaration(statement) && !ts.isClassDeclaration(statement)) return null;
  if (statement.members.length !== 1) return null;
  return { node: statement.members[0], sf };
}

// A line of a variable/type/function slot opens a statement when it starts with a
// declaration keyword followed by a name (`export declare function f(`, `type X =`);
// every other line is a member of an inline object type. A member NAMED like a keyword
// (`type: "a";`, `declare?: boolean;`) is followed by `:`/`?`/`(`, never by a name.
const STATEMENT_LINE =
  /^(?:export|declare|function|type|const|let|var|class|interface|enum|namespace|abstract)\s+[\w$]/;

const lineShape = (line) => (STATEMENT_LINE.test(line) ? 'statement' : 'member');

function childNodes(node) {
  const children = [];
  node.forEachChild((child) => {
    children.push(child);
  });
  return children;
}

// The node's OWN tokens — every token of its text outside its child nodes, comments
// and a trailing member separator skipped — with a marker in each child's place:
// `keyof \0`, `\0 [ ]`, `\0 < \0 >`, `\0 \0 : \0` (a `readonly` property). Two nodes
// of one kind with the same own tokens differ only inside their children.
function ownTokens(node, sf) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true);
  const tokens = [];
  const scan = (start, end) => {
    scanner.setText(sf.text, start, end - start);
    while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) tokens.push(scanner.getTokenText());
  };
  let pos = node.getStart(sf);
  for (const child of childNodes(node)) {
    scan(pos, child.getStart(sf));
    tokens.push('\0');
    pos = child.getEnd();
  }
  scan(pos, node.getEnd());
  if (MEMBER_SEPARATOR.test(tokens.at(-1) ?? '')) tokens.pop();
  return tokens.join(' ');
}

const isSignatureNode = (node) =>
  ts.isFunctionTypeNode(node) ||
  ts.isConstructorTypeNode(node) ||
  ts.isMethodSignature(node) ||
  ts.isCallSignatureDeclaration(node) ||
  ts.isConstructSignatureDeclaration(node) ||
  ts.isFunctionDeclaration(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

const sameText = (a, sa, b, sb) => (a ? nodeText(a, sa) : '') === (b ? nodeText(b, sb) : '');

const sameList = (a, sa, b, sb) =>
  (a ?? []).map((n) => nodeText(n, sa)).join(',') ===
  (b ?? []).map((n) => nodeText(n, sb)).join(',');

const memberName = (member, sf) =>
  member.name ? nodeText(member.name, sf) : ts.SyntaxKind[member.kind];

// Every old member of an object type survives in the new one under its name, grown
// only additively; every new member left over is a NAMED `?`-optional member. An added
// required member, index signature or call signature is not additive.
function additiveMembers(oldMembers, sa, newMembers, sb) {
  const pool = [...newMembers];
  for (const oldMember of oldMembers) {
    const name = memberName(oldMember, sa);
    const idx = pool.findIndex(
      (newMember) =>
        memberName(newMember, sb) === name && additiveNode(oldMember, sa, newMember, sb),
    );
    if (idx === -1) return false;
    pool.splice(idx, 1);
  }
  return pool.every((member) => Boolean(member.questionToken) && Boolean(member.name));
}

// The same alternatives in any order, each old one surviving additively in a distinct
// new one. A union gains no alternative here: only an all-literal union may grow
// (literalAlternatives).
function additiveAlternatives(oldTypes, sa, newTypes, sb) {
  if (oldTypes.length !== newTypes.length) return false;
  const pool = [...newTypes];
  for (const oldType of oldTypes) {
    let idx = pool.findIndex((newType) => sameText(oldType, sa, newType, sb));
    if (idx === -1) idx = pool.findIndex((newType) => additiveNode(oldType, sa, newType, sb));
    if (idx === -1) return false;
    pool.splice(idx, 1);
  }
  return true;
}

// additiveNode over two possibly-absent nodes: both absent, or both present and grown
// only additively.
const additiveOptionalNode = (a, sa, b, sb) => (a && b ? additiveNode(a, sa, b, sb) : !a && !b);

// A signature grown only additively: its modifiers, name, type parameters and own `?`
// identical; every old param kept in place with the same modifiers, name, `?` and `...`
// and a type grown only additively; every appended param `?`-optional and not a rest
// param; its return type grown only additively. An optional param inserted before an
// existing one shifts every later positional argument, so it is not additive.
function additiveSignature(a, sa, b, sb) {
  if (!sameList(a.modifiers, sa, b.modifiers, sb)) return false;
  if (!sameText(a.name, sa, b.name, sb)) return false;
  if (!sameList(a.typeParameters, sa, b.typeParameters, sb)) return false;
  if (Boolean(a.questionToken) !== Boolean(b.questionToken)) return false;
  if (b.parameters.length < a.parameters.length) return false;
  for (const [i, oldParam] of a.parameters.entries()) {
    const newParam = b.parameters[i];
    if (!sameList(oldParam.modifiers, sa, newParam.modifiers, sb)) return false;
    if (!sameText(oldParam.name, sa, newParam.name, sb)) return false;
    if (Boolean(oldParam.questionToken) !== Boolean(newParam.questionToken)) return false;
    if (Boolean(oldParam.dotDotDotToken) !== Boolean(newParam.dotDotDotToken)) return false;
    if (!additiveOptionalNode(oldParam.type, sa, newParam.type, sb)) return false;
  }
  const appended = b.parameters.slice(a.parameters.length);
  if (!appended.every((param) => param.questionToken && !param.dotDotDotToken)) return false;
  return additiveOptionalNode(a.type, sa, b.type, sb);
}

// True iff node `b` (in source file `sb`) is node `a` (in `sa`) grown only by the
// gate's three additive shapes, at any depth: a literal type or all-literal union
// widened with more literal alternatives; an object type with added `?`-optional
// members; a signature with appended `?`-optional params. Everything else must be the
// same, up to whitespace, comments, namespace-alias qualifiers, parentheses and the
// order of a union's alternatives.
function additiveNode(oldNode, sa, newNode, sb) {
  const a = unparenthesized(oldNode);
  const b = unparenthesized(newNode);
  if (sameText(a, sa, b, sb)) return true;
  const oldLiterals = literalAlternatives(a, sa);
  const newLiterals = literalAlternatives(b, sb);
  if (oldLiterals && newLiterals) return [...oldLiterals].every((l) => newLiterals.has(l));
  if (a.kind !== b.kind) return false;
  if (ts.isTypeLiteralNode(a)) return additiveMembers(a.members, sa, b.members, sb);
  if (ts.isUnionTypeNode(a)) return additiveAlternatives(a.types, sa, b.types, sb);
  if (isSignatureNode(a)) return additiveSignature(a, sa, b, sb);
  if (ownTokens(a, sa) !== ownTokens(b, sb)) return false;
  const oldChildren = childNodes(a);
  const newChildren = childNodes(b);
  return (
    oldChildren.length === newChildren.length &&
    oldChildren.every((child, i) => additiveNode(child, sa, newChildren[i], sb))
  );
}

// True iff `newText` is `oldText` grown only additively (additiveNode), both parsed as
// the fragment `shape` (parseFragment). A side the parser rejects is not additive, so
// the change reads as breaking: the diff never loosens on text it cannot read.
function isAdditiveFragment(oldText, newText, shape) {
  const oldFragment = parseFragment(oldText, shape);
  const newFragment = parseFragment(newText, shape);
  if (!oldFragment || !newFragment) return false;
  return additiveNode(oldFragment.node, oldFragment.sf, newFragment.node, newFragment.sf);
}

// isAdditiveFragment over two lines of a variable/type/function slot, each parsed as
// the shape its leading keyword names (lineShape); lines of different shapes are not
// additive.
function isAdditiveLineChange(oldLine, newLine) {
  const shape = lineShape(oldLine);
  return shape === lineShape(newLine) && isAdditiveFragment(oldLine, newLine, shape);
}

// True when `newText` is a purely-additive superset of `oldText`: every member line
// of the old declaration still appears in the new one — either canonically equal (its
// whitespace, union order and namespace-alias qualifiers folded by lineMultiset), or
// as a line grown only additively (isAdditiveLineChange: a widened literal union, an
// added optional property, appended optional params) — so the change is only
// insertions and backward-compatible growth. Any old line with no such survivor means
// an existing member was removed, retyped or narrowed — not additive. A
// reordering-only change is additive (all old lines survive), which is correct. Known
// blind spots: the multiset is per-declaration, so a narrowing whose removed line is
// re-added elsewhere in the same declaration in the same release reads as additive;
// and folding namespace-alias qualifiers pairs `s.Foo` with `Foo` by leaf name, so a
// same-leaf requalification to a DIFFERENT module (`s.Foo` -> `t.Foo`) reads as no
// change. Every realistic breaking change carries a distinctive vanished line.
function isAdditive(oldText, newText) {
  const newLines = lineMultiset(newText);
  const leftover = [];
  for (const [line, oldSources] of lineMultiset(oldText)) {
    const newSources = newLines.get(line) ?? [];
    const consumed = Math.min(oldSources.length, newSources.length);
    newSources.splice(0, consumed);
    leftover.push(...oldSources.slice(consumed));
  }
  if (leftover.length === 0) return true;
  const pool = [...newLines.values()].flat();
  for (const oldLine of leftover) {
    const idx = pool.findIndex((candidate) => isAdditiveLineChange(oldLine, candidate));
    if (idx === -1) return false;
    pool.splice(idx, 1);
  }
  return true;
}

// Removal or non-additive change of a member is breaking; a member turned required
// (optional -> required) is breaking; a NEW required member is breaking. Added
// optional members, added overloads and a member declaration grown only additively
// (isAdditiveFragment, parsed as the `shape` of member it is: 'member' of an
// interface, 'class-member' of a class) are non-breaking, and a member turned OPTIONAL
// (required -> optional) is non-breaking — loosening a requirement never breaks a consumer, and
// the optionality-normalized signatures compare equal across the flip.
// Documented-conservative: adding `readonly` to a member reads as a signature
// change and stays breaking (it genuinely breaks writers).
function classifyMembers(add, symbol, oldMembers, newMembers, shape) {
  for (const [key, oldMember] of oldMembers) {
    const newMember = newMembers.get(key);
    if (!newMember) {
      add(symbol, `member "${key}" was removed`);
      continue;
    }
    if (oldMember.optional && !newMember.optional) {
      add(symbol, `member "${key}" became required`);
      continue;
    }
    const newSignatures = [...newMember.signatures.values()];
    for (const [sig, oldText] of oldMember.signatures) {
      if (newMember.signatures.has(sig)) continue;
      // A member whose declaration changed only by additive growth is
      // backward-compatible: satisfied when SOME new declaration of the same member is
      // the old one grown only additively (isAdditiveFragment).
      if (newSignatures.some((candidate) => isAdditiveFragment(oldText, candidate, shape)))
        continue;
      add(symbol, `member "${key}" signature removed or changed`);
      break;
    }
  }
  for (const [key, newMember] of newMembers) {
    if (!oldMembers.has(key) && !newMember.optional) {
      add(symbol, `new required member "${key}" was added`);
    }
  }
}

// Type aliases. The alias's own type parameters (its head) are judged first, like a
// declaration head: any change to them is breaking unless the new ones are the old
// grown only additively (a widened literal union in a constraint or a default). Its
// body is judged on its own: an all-literal union widened with additional
// alternatives (old set a subset of new) is non-breaking and a removed/changed
// alternative is breaking; any other body is compared by its text and lines.
function classifyType(add, symbol, oldEntry, newEntry) {
  if (
    normalize(oldEntry.head) !== normalize(newEntry.head) &&
    !isAdditiveFragment(oldEntry.head, newEntry.head, 'statement')
  ) {
    add(symbol, 'type parameters changed');
    return;
  }
  if (oldEntry.literals && newEntry.literals) {
    for (const lit of oldEntry.literals) {
      if (!newEntry.literals.has(lit)) {
        add(symbol, 'a union member was removed or changed');
        break;
      }
    }
    return;
  }
  // A non-literal-union alias: a purely-additive change (a member line added to an
  // inline object type) is minor-allowed; a removed/retyped member is breaking. A
  // single-line union that gains a member reads as non-additive (its one line
  // changed) and stays breaking — the documented-conservative behaviour for a
  // non-literal union widening is preserved.
  if (
    normalize(oldEntry.body) !== normalize(newEntry.body) &&
    !isAdditive(oldEntry.body, newEntry.body)
  )
    add(symbol, 'type alias declaration changed');
}

// The blocks a variable can sit in, by what a consumer can do with its members (each
// rule from tsc). A UMD module's top level (one with `export as namespace`), a
// namespace or a global block holds members a consumer can assign unless they are
// `const`. A namespace, global block or `declare module "x"` member declared `var` can
// be redeclared by a consumer's augmentation (and a global `var` alone is read through
// `globalThis`); `let` and `const` refuse both. A global `let` stays narrowed inside a
// callback where a global `var` does not; in every other block that narrowing fails
// under all three keywords. A module's own top-level variable is none of these:
// importers read it as read-only and cannot redeclare it, whatever its keyword.
const ASSIGNABLE_BLOCKS = new Set(['umd-module', 'namespace', 'global']);

const REDECLARABLE_BLOCKS = new Set(['namespace', 'global', 'ambient-module']);

const NARROWED_LET_BLOCKS = new Set(['global']);

// Whether a variable's declaration keyword change, in a block of the given kind, can
// break a consumer. `let` turned `var` breaks where a `let` stays narrowed. `var`
// turned `let` breaks where a `var` can be redeclared; `let` turned `const` where the
// member is assignable; `var` turned `const` where either holds. `const` alone allows
// a literal initializer (`const a = "x"`, typed `"x"`) and a `unique symbol` type, so
// `const` turned `let` or `var` breaks readers in every block. Any other keyword
// change (a keyword the diff does not know) is breaking.
function variableKeywordBreaks(oldKeyword, newKeyword, block) {
  if (oldKeyword === newKeyword) return false;
  if (oldKeyword === 'let' && newKeyword === 'var') return NARROWED_LET_BLOCKS.has(block);
  if (oldKeyword === 'var' && newKeyword === 'let') return REDECLARABLE_BLOCKS.has(block);
  if (oldKeyword === 'let' && newKeyword === 'const') return ASSIGNABLE_BLOCKS.has(block);
  if (oldKeyword === 'var' && newKeyword === 'const')
    return ASSIGNABLE_BLOCKS.has(block) || REDECLARABLE_BLOCKS.has(block);
  return true;
}

// Breaking classification for one entries map, old -> new. `scope` prefixes every
// finding and `block` names the kind of block the entries sit in ('module' for a
// report's top level); it recurses into namespaces with the nested scope and block.
function classifyEntries(scope, oldEntries, newEntries, block = 'module') {
  const findings = [];
  const add = (symbol, detail) => findings.push(`${scope}${symbol}: ${detail}`);

  for (const [name, oldEntry] of oldEntries) {
    const newEntry = newEntries.get(name);
    if (!newEntry) {
      add(name, 'symbol was removed');
      continue;
    }
    // Export status, for every kind and at every depth: a declaration that lost its
    // `export` is gone from the names consumers import; one that gained it is a new
    // export, so the comparison below never sees the modifier.
    if (oldEntry.exported && !newEntry.exported) {
      add(name, 'export was removed');
      continue;
    }
    if (newEntry.kind !== oldEntry.kind) {
      add(name, `kind changed (${oldEntry.kind} -> ${newEntry.kind})`);
      continue;
    }
    switch (oldEntry.kind) {
      case 'interface':
      case 'class':
        // The declaration's own modifiers, type parameters and heritage clauses: any
        // change to them is breaking unless the new head is the old one grown only
        // additively (a widened literal union in a heritage type argument).
        if (
          normalize(oldEntry.head) !== normalize(newEntry.head) &&
          !isAdditiveFragment(oldEntry.head, newEntry.head, 'statement')
        )
          add(name, 'modifiers, type parameters or heritage clauses changed');
        classifyMembers(
          add,
          name,
          oldEntry.members,
          newEntry.members,
          oldEntry.kind === 'class' ? 'class-member' : 'member',
        );
        break;
      case 'function': {
        // An old overload is satisfied when the new surface still carries it
        // unchanged OR an additive superset of it (a param/member line added inside
        // its inline signature). Added overloads and additive growth of an existing
        // one are non-breaking; only an overload that vanished or changed
        // non-additively (a removed/retyped/narrowed member or param) is breaking.
        const newRaw = [...newEntry.signatures.values()];
        for (const [sig, oldRaw] of oldEntry.signatures) {
          if (newEntry.signatures.has(sig)) continue;
          // isAdditive covers growth by whole lines (a member/param line added inside
          // the signature); isAdditiveFragment judges the whole overload parsed as
          // its declaration (appended optional params, a widened literal union, an
          // optional property added inside an inline object type, at any depth).
          if (newRaw.some((candidate) => isAdditive(oldRaw, candidate))) continue;
          if (newRaw.some((candidate) => isAdditiveFragment(oldRaw, candidate, 'statement')))
            continue;
          add(name, 'a function overload was removed or changed');
          break;
        }
        break;
      }
      case 'enum':
        // A `const enum` accepts only member access, and none at all from an ambient
        // declaration under `isolatedModules`, so `const` added breaks consumers; a
        // plain enum accepts every use a `const enum` did, so `const` dropped does not.
        if (!oldEntry.constant && newEntry.constant) add(name, 'enum made const');
        for (const [member, text] of oldEntry.members) {
          const newText = newEntry.members.get(member);
          if (newText === undefined) add(name, `enum member "${member}" was removed`);
          else if (newText !== text) add(name, `enum member "${member}" changed`);
        }
        break;
      case 'namespace':
        findings.push(
          ...classifyEntries(
            `${scope}${name}.`,
            oldEntry.entries,
            newEntry.entries,
            oldEntry.block,
          ),
        );
        break;
      case 'type':
        classifyType(add, name, oldEntry, newEntry);
        break;
      case 'variable':
        if (variableKeywordBreaks(oldEntry.keyword, newEntry.keyword, block))
          add(
            name,
            `variable declaration keyword changed from ${oldEntry.keyword} to ${newEntry.keyword}`,
          );
      // falls through: the declarator text is compared like any text-compared slot.
      default:
        // A variable (and any other text-compared slot). A change is breaking only
        // when it is not purely additive — a new member line appended to a client
        // object / inline object type is minor-allowed, a removed or retyped member
        // is breaking. Re-exports and export-assignments have no `raw` and compare as
        // a single normalized line, so any change to one reads as non-additive.
        if (
          oldEntry.text !== newEntry.text &&
          !isAdditive(oldEntry.raw ?? oldEntry.text, newEntry.raw ?? newEntry.text)
        )
          add(name, 'declaration text changed');
    }
  }
  // Text TypeScript could not parse is never judged additive, so text the old report
  // did not hold is a change too (a dropped or changed one is caught above).
  for (const [name, newEntry] of newEntries) {
    if (newEntry.kind === 'unparsed' && !oldEntries.has(name))
      add(name, 'text TypeScript could not parse was added');
  }
  return findings;
}

function classify(reportName, oldEntries, newEntries) {
  // A module with `export as namespace` is also a global namespace for scripts, whose
  // members they can assign.
  const block = oldEntries.has('export as namespace') ? 'umd-module' : 'module';
  return classifyEntries(`${reportName} :: `, oldEntries, newEntries, block);
}

export { classify };
