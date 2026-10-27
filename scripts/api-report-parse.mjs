// The api-extractor report parser: turn the `ts` fence of a report into its public-API
// surface, a map from each declared or exported name to an entry holding that
// declaration's kind, export status and text in canonical form
// (scripts/api-canonical-text.mjs). scripts/api-surface-diff.mjs compares two such maps.
//
// Every top-level declaration in a report's `ts` fence becomes an entry, exported or
// not: an api-extractor report lists only declarations reachable from the public
// surface, so a non-exported schema const backing an exported `z.infer` alias is
// itself part of the contract and a change to it is a potential surface change.
// Bare re-export statements (`export { Foo }`, `export { Bar as Foo }`, `export
// type { Foo }`, `export * as ns from 'm'`) count too: api-extractor emits one for
// every symbol a package re-exports from a dependency, and those are public API
// exactly like a local declaration — dropping one removes a name consumers import.
// So do the default slots (`export default`, `export =`, and an inline `export
// default class Foo {}`). A wildcard `export * from 'm'` names no symbol at all, so
// no classification of it can be computed: it fails the gate rather than passing
// silently over whatever vanished behind it.
//
// Export status follows each block's own rule. At a module's top level a declaration
// is exported only when marked `export`. A namespace or `declare module "x"` whose
// block holds no export declaration or assignment exports every member; one whose
// block holds any (`export {}`, `export { x }`, `export *`, `export =`, `export
// default x`), wherever in the block, exports only the members marked `export`. An
// inline `export default` declaration is never exported under its own name. Every
// member of a global block is a global. A dotted namespace (`namespace A.B`) is the
// nested namespaces it stands for. The UMD name of `export as namespace L` is a slot
// of its own: dropped or renamed, it breaks the scripts that read `L`.
//
// A report the parser cannot read throws GateError: a report with no `ts` code fence, a
// name declared or exported twice (two declarations TypeScript merges into one symbol, a
// declaration and an `export { … }` of the same name, two default exports; only
// function overloads share a name), or a statement kind the parser does not model
// (anything but a declaration, an export, an `import … from` declaration, or text
// TypeScript could not parse; an `import x = …` is one). api-extractor can render lines
// TypeScript rejects (a bare `infer<S>`, for one); TypeScript then ends the declaration
// early and reads the rest of the line as separate statements, which the parser keeps as
// that declaration's unparsed text.

import ts from 'typescript';

import { literalAlternatives, normalize } from './api-canonical-text.mjs';
import { fail } from './gate-error.mjs';

// A stable key for an interface/class member. Named members key by their name;
// the unnamed members (index/call/construct signatures, a class constructor) key by a
// synthesized constant so their removal or change is compared rather than skipped.
function memberKey(member, sf) {
  if (member.name) return member.name.getText(sf);
  if (ts.isConstructorDeclaration(member)) return '[constructor]';
  if (ts.isIndexSignatureDeclaration(member)) return '[index signature]';
  if (ts.isCallSignatureDeclaration(member)) return '[call signature]';
  if (ts.isConstructSignatureDeclaration(member)) return '[construct signature]';
  return null;
}

// A member's declaration text with its own optionality token ("?") removed, so a
// required <-> optional flip does not read as a signature change. The flip is
// classified from the separate `optional` flag; the signature carries everything
// else (readonly, parameters, type). Only the member's OWN question token is
// stripped — a "?" inside a parameter list or type is left intact.
function memberSignature(member, sf) {
  const text = member.getText(sf);
  const q = member.questionToken;
  if (!q) return text;
  const base = member.getStart(sf);
  return text.slice(0, q.getStart(sf) - base) + text.slice(q.getEnd() - base);
}

// Members keyed by name (or synthesized signature key) -> { optional, signatures }.
// signatures maps each optionality-stripped declaration text, normalized, to that
// text as the report renders it (for the additive comparison, which parses it), so
// overloaded methods keep every overload (like a top-level function); a member is
// optional only when every declaration of it is optional.
function collectMembers(node, sf) {
  const map = new Map();
  for (const member of node.members) {
    const key = memberKey(member, sf);
    if (key === null) continue;
    const optional = Boolean(member.questionToken);
    const entry = map.get(key) ?? { optional, signatures: new Map() };
    entry.optional = entry.optional && optional;
    const signature = memberSignature(member, sf);
    entry.signatures.set(normalize(signature), signature);
    map.set(key, entry);
  }
  return map;
}

const hasModifier = (node, kind) =>
  node.modifiers?.some((modifier) => modifier.kind === kind) ?? false;

// Whether a declaration's name is an export of its scope (the module, or the
// namespace it sits in). `export default` exports only the default slot, never the
// name: `import { f }` of an `export default function f` fails. classifyEntries
// judges this one flag for every kind of entry.
const isExported = (node) =>
  hasModifier(node, ts.SyntaxKind.ExportKeyword) &&
  !hasModifier(node, ts.SyntaxKind.DefaultKeyword);

// The modifiers a declaration's compared text leaves out. `export` and `default` are
// its export status, judged once, apart, from the entry's `exported` flag and its
// default slot. `declare` changes nothing in a declaration file, where every
// declaration is ambient (`export default function f` cannot carry it at all, while
// the same function declared apart and exported by `export default f` does).
const UNCOMPARED_MODIFIERS = new Set([
  ts.SyntaxKind.ExportKeyword,
  ts.SyntaxKind.DefaultKeyword,
  ts.SyntaxKind.DeclareKeyword,
]);

// A declaration's source text from just after its leading run of uncompared
// modifiers up to `end`: the text it is compared by.
function comparedText(node, sf, end = node.end) {
  const modifiers = node.modifiers ?? [];
  let lead = 0;
  while (lead < modifiers.length && UNCOMPARED_MODIFIERS.has(modifiers[lead].kind)) lead += 1;
  const start = lead ? ts.skipTrivia(sf.text, modifiers[lead - 1].end) : node.getStart(sf);
  return sf.text.slice(start, end);
}

// An interface or class declaration with its member list emptied — its modifiers
// other than `export`/`default`/`declare`, name, type parameters and heritage clauses
// (`abstract class C<T> extends B implements I {}`) — so a change to any of them is
// judged apart from the members.
const declarationHead = (node, sf) => `${comparedText(node, sf, node.members.pos)}}`;

function enumMembers(node, sf) {
  const map = new Map();
  for (const member of node.members)
    map.set(member.name.getText(sf), normalize(member.getText(sf)));
  return map;
}

// The re-export's source module rendered for an entry's text, or '' when the
// statement re-exports a local symbol (api-extractor's usual form: it declares the
// symbol above and re-exports it bare). Carrying the module means re-pointing an
// exported name at a DIFFERENT package reads as a change instead of a no-op.
function moduleSuffix(node, sf) {
  return node.moduleSpecifier ? ` from ${normalize(node.moduleSpecifier.getText(sf))}` : '';
}

// Classify one `export ... ` statement into entries.
//
//   * `export { Foo }` / `export { Bar as Foo }` / `export type { Foo }` [from 'm']
//     — keyed by the EXPORTED name (what a consumer imports); the text carries the
//     local symbol behind it, the type-only flag and the source module, so
//     re-pointing a name at a different symbol or package, or narrowing a value
//     export to type-only, is a change rather than a silent no-op.
//   * `export * as ns from 'm'` — names one symbol (`ns`), keyed by it.
//   * `export * from 'm'` — names NO symbol: the set of exports it carries cannot be
//     computed from the report, so a name silently vanishing behind it would pass the
//     gate. The gate never passes on a classification it could not compute, so this
//     fails LOUDLY instead.
function classifyExportDeclaration(put, node, sf) {
  const typeOnlyPrefix = node.isTypeOnly ? 'type ' : '';
  if (!node.exportClause) {
    fail(
      `report ${sf.fileName} has an unclassifiable \`export *${moduleSuffix(node, sf)}\`: it names no symbol, ` +
        'so the gate cannot tell whether an export disappeared behind it. Enumerate the exports explicitly ' +
        '(`export { A, B } from ...`).',
    );
  }
  if (ts.isNamespaceExport(node.exportClause)) {
    put(node.exportClause.name.getText(sf), {
      kind: 're-export',
      text: `${typeOnlyPrefix}*${moduleSuffix(node, sf)}`,
    });
    return;
  }
  for (const spec of node.exportClause.elements) {
    const local = (spec.propertyName ?? spec.name).getText(sf);
    const typeOnly = node.isTypeOnly || spec.isTypeOnly;
    put(spec.name.getText(sf), {
      kind: 're-export',
      text: `${typeOnly ? 'type ' : ''}${local}${moduleSuffix(node, sf)}`,
    });
  }
}

// The DEFAULT export slot of a declaration that carries `export default` inline
// (`export default class Foo {}`, `export default function foo() {}`), or null. The
// declaration itself is classified under its own name, which such a declaration does
// not export; the default slot is the name consumers import it by, and losing it
// breaks every `import Foo from '<pkg>'` consumer.
function defaultSlotText(node, sf) {
  const isDefault = node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
  );
  if (!isDefault) return null;
  // The slot records the name it points at, exactly as `export default <name>` does,
  // so moving between the two forms is no change and only a re-point or a drop is.
  // An anonymous default declaration has no name to point at, so its whole text is
  // the slot's identity — any change to it reads as a change of the default export.
  return node.name
    ? node.name.getText(sf)
    : `${ts.SyntaxKind[node.kind]} ${normalize(node.getText(sf))}`;
}

// A module declaration's entry: the kind of block it opens — 'global' for
// `declare global` (and a `global` block inside an augmentation), 'ambient-module'
// for `declare module "x"`, else 'namespace' — and its members. A dotted namespace
// (`namespace A.B {}`) parses as `A` whose body is the declaration `B`, so `B` is A's
// one member, exported as the dotted name makes it. Every member of a global block
// is a global, so reachable. A namespace or `declare module "x"` whose block holds no
// export declaration or assignment exports every member; one whose block holds any
// (`export {}`, `export { x }`, `export *`, `export =`, `export default x`), wherever
// in the block, exports only the members marked `export`.
function namespaceEntry(node, sf) {
  const block = ts.isGlobalScopeAugmentation(node)
    ? 'global'
    : ts.isStringLiteral(node.name)
      ? 'ambient-module'
      : 'namespace';
  const body = node.body;
  if (body && ts.isModuleDeclaration(body)) {
    const inner = { ...namespaceEntry(body, sf), exported: true };
    return { kind: 'namespace', block, entries: new Map([[body.name.getText(sf), inner]]) };
  }
  const statements = body && ts.isModuleBlock(body) ? body.statements : [];
  const implicitExport =
    block === 'global' ||
    !statements.some(
      (statement) => ts.isExportDeclaration(statement) || ts.isExportAssignment(statement),
    );
  return { kind: 'namespace', block, entries: collectEntries(statements, sf, implicitExport) };
}

// Parse a list of declarations into a map of symbol name -> entry, exported or not
// (every declaration in an api-extractor report is reachable from the public
// surface, so a non-exported one is part of the contract). Each entry carries its
// kind plus, for the shapes semver cares about, the structure that classification
// compares; a namespace recurses into its own members. Each name holds ONE
// declaration — api-extractor suffixes `_2` to keep distinct symbols apart — with
// function overloads the only declarations that share a name (one entry, one
// signature each, the overloads of an inline default function likewise sharing the
// default slot). A name declared or exported twice — two declarations TypeScript
// merges into one symbol (an interface and a namespace, two interfaces), a
// declaration and an `export { … }` of the same name, two default exports — fails
// the gate: the map keys each name to one entry, and keeping either one would pass
// whatever changed in the other. `implicitExport` marks a block that exports every
// member whatever its modifiers (see namespaceEntry).
//
// Statements a declaration file holds and the diff does not judge one by one: an
// `import … from` declaration only names a dependency, whose types reach the surface
// through the declarations that use them (an `import x = …` is not skipped: it fails
// the gate below). An expression or empty statement has no meaning in a
// declaration file and appears only where TypeScript rejected a line and recovered
// mid-declaration (a bare `infer<S>`), so its text is kept as a "(text TypeScript
// could not parse)" entry after the declaration it broke off from (every piece after
// one declaration joined into one entry), and that text added, dropped or changed
// reads as breaking. Any other statement kind fails the gate.
function collectEntries(statements, sf, implicitExport = false) {
  const entries = new Map();
  // The name the latest declaration put, which an unparsed fragment belongs to.
  let lastName = null;
  for (const node of statements) {
    // Every entry this statement yields carries whether it is exported: a declaration
    // by its own `export` modifier or by its block's implicit export (never an inline
    // `export default` declaration's own name), a re-export or export assignment
    // always.
    const exported =
      (implicitExport && !hasModifier(node, ts.SyntaxKind.DefaultKeyword)) ||
      isExported(node) ||
      ts.isExportDeclaration(node) ||
      ts.isExportAssignment(node);
    // `label` names an entry in the duplicate-name message when its kind alone does
    // not say what it is (an inline default declaration's slot).
    const put = (name, entry, isExport = exported) => {
      const existing = entries.get(name);
      if (existing) {
        fail(
          `report ${sf.fileName} declares or exports the name "${name}" twice ` +
            `(${existing.label ?? existing.kind} and ${entry.label ?? entry.kind}). The gate ` +
            'keys each name to one entry, so it cannot classify this name.',
        );
      }
      entries.set(name, { ...entry, exported: isExport });
      lastName = name;
    };
    // A function overload joins the entry its name's first overload put, keyed by
    // normalized text so a genuinely-unchanged overload matches exactly; the raw
    // multi-line text is kept for the additive-superset comparison. TypeScript requires
    // every overload to agree on `export`, so the first one's flag holds for all.
    const putOverload = (name, text, isExport = exported) => {
      const overloads = entries.get(name);
      if (overloads?.kind === 'function') {
        overloads.signatures.set(normalize(text), text);
        lastName = name;
      } else
        put(name, { kind: 'function', signatures: new Map([[normalize(text), text]]) }, isExport);
    };
    // An inline `export default` on a declaration: record the default SLOT here, then
    // classify the declaration itself under its own name in the chain below. The
    // overloads of an anonymous default function have no name to be judged under, so
    // they are the slot's overloads; those of a named one put the slot once.
    const defaultSlot = defaultSlotText(node, sf);
    // The slot is an export even though the declaration's name is not.
    if (defaultSlot !== null && ts.isFunctionDeclaration(node) && !node.name) {
      putOverload('export default', comparedText(node, sf), true);
    } else if (defaultSlot !== null) {
      const slot = entries.get('export default');
      const declared = ts.isClassDeclaration(node)
        ? 'class'
        : ts.isInterfaceDeclaration(node)
          ? 'interface'
          : 'function';
      // A further overload of a named default function finds the slot its first put.
      const furtherOverload =
        declared === 'function' && slot?.label === 'default function' && slot.text === defaultSlot;
      if (!furtherOverload)
        put(
          'export default',
          { kind: 'export-assignment', label: `default ${declared}`, text: defaultSlot },
          true,
        );
    }
    if (ts.isInterfaceDeclaration(node)) {
      put(node.name.text, {
        kind: 'interface',
        head: declarationHead(node, sf),
        members: collectMembers(node, sf),
      });
    } else if (ts.isClassDeclaration(node) && node.name) {
      put(node.name.text, {
        kind: 'class',
        head: declarationHead(node, sf),
        members: collectMembers(node, sf),
      });
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      putOverload(node.name.text, comparedText(node, sf));
    } else if (ts.isTypeAliasDeclaration(node)) {
      // The alias split in two, each still a statement TypeScript parses: its head
      // (name and type parameters, its type replaced by `unknown`) and its body (its
      // type, under the bare name), so each is judged once and on its own.
      const body = `type ${node.name.text} = ${sf.text.slice(node.type.getStart(sf), node.end)}`;
      put(node.name.text, {
        kind: 'type',
        head: `${comparedText(node, sf, node.type.getFullStart())} unknown;`,
        body,
        literals: literalAlternatives(node.type, sf),
      });
    } else if (ts.isEnumDeclaration(node)) {
      put(node.name.text, {
        kind: 'enum',
        constant: hasModifier(node, ts.SyntaxKind.ConstKeyword),
        members: enumMembers(node, sf),
      });
    } else if (ts.isModuleDeclaration(node)) {
      put(node.name.getText(sf), namespaceEntry(node, sf));
    } else if (ts.isVariableStatement(node)) {
      // The declaration keyword (`const`, `let`, `var`) is not part of a declarator's
      // text, so it is kept apart and judged in classifyEntries.
      const keyword = node.declarationList.getFirstToken(sf).getText(sf);
      for (const decl of node.declarationList.declarations) {
        put(decl.name.getText(sf), {
          kind: 'variable',
          keyword,
          text: normalize(decl.getText(sf)),
          raw: decl.getText(sf),
        });
      }
    } else if (ts.isExportDeclaration(node)) {
      classifyExportDeclaration(put, node, sf);
    } else if (ts.isExportAssignment(node)) {
      // `export default Foo` / `export = Foo`. Each is a single consumable slot, so
      // it is keyed by the slot (not by the symbol behind it): dropping the default
      // export breaks every `import Foo from '<pkg>'`, and swapping `export default`
      // for `export =` reads as one slot removed and another added — both breaking.
      put(node.isExportEquals ? 'export=' : 'export default', {
        kind: 'export-assignment',
        text: normalize(node.expression.getText(sf)),
      });
    } else if (ts.isNamespaceExportDeclaration(node)) {
      // `export as namespace L`: scripts reach the module as the global `L`, so the
      // name is a slot like a default export — dropped or renamed, it breaks them.
      put('export as namespace', { kind: 'umd-global', text: node.name.text }, true);
    } else if (ts.isExpressionStatement(node) || ts.isEmptyStatement(node)) {
      if (lastName === null)
        fail(`report ${sf.fileName} opens a block with text TypeScript could not parse.`);
      const owner = entries.get(lastName);
      const name = `${lastName} (text TypeScript could not parse)`;
      const fragment = entries.get(name);
      const text = normalize(node.getText(sf));
      if (fragment) fragment.text = `${fragment.text} ${text}`;
      else entries.set(name, { kind: 'unparsed', text, exported: owner.exported });
    } else if (defaultSlot === null && !ts.isImportDeclaration(node)) {
      // (An anonymous default declaration is modelled by its default slot above.)
      fail(
        `report ${sf.fileName} holds a ${ts.SyntaxKind[node.kind]} statement, which the ` +
          'gate does not model, so it cannot classify the report.',
      );
    }
  }
  return entries;
}

function parseReport(name, source) {
  const fence = source.match(/```ts\n([\s\S]*?)\n```/);
  if (!fence) fail(`report ${name} has no \`\`\`ts code fence`);
  const sf = ts.createSourceFile(name, fence[1], ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  return collectEntries(sf.statements, sf);
}

export { parseReport };
