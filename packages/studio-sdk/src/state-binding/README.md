# State-binding editor

The one binding shape every door (preset, channel route, schedule, hook) and every
flow node authors, plus its pure helpers. Lives in the SDK so any plugin door reuses
it; holds no edge to jq (the jq fields render through the host's ambient
`ExpressionFieldContext`, else a plain textarea) and paints from SDK tokens only.

## The canonical jq contracts

- **template `input` jq** — input is the record (`.`), declared params bound as
  `$params`; returns the injected value.
- **custom injection jq** — over `{ record, input }`; returns the value placed at `into`.
- **adapter** — over `{ output, input }`; CONSTRUCTS the update jq's declared input
  object.
- **template `update` jq** — over `{ record, input }` where `input` is the adapter's
  output; returns a template-relative op batch.
- **custom `update` jq** — over `{ record, output, input }`; returns `[{op, path, value}]`.
- **`subject_expr`** — a jq yielding the record KEY: a bare key string, or a full subject object.
- **`scope_expr`** — optional; a boolean jq predicate. When it is false, the state is skipped for the run.

## The adapter's parseable shape (round-trip)

Every form is rebuilt from STORED data, never UI-only state. `compileAdapter` emits a
canonical, parseable object so a stored adapter reopens as the form it was authored in:

```
{ <key>: (<value>), … }
```

- `<key>` — a bare identifier, or a JSON string when it is not one.
- `<value>` — one of: a field path (`.output…` / `.input…`), a JSON literal, or a raw
  jq expression, each wrapped in `(…)`.

`parseAdapter` inverts it: `parseAdapter(compileAdapter(rows).jq) === rows` for every
row kind whose literal is already canonical JSON. A shape it does not recognise returns
`null`, and the editor opens the raw-jq escape hatch instead.

A template update that must ride inside ONE jq field is written as the call
`tjq_<name>(<adapter object>)` (`generateTemplateCall` / `parseTemplateCall`); a field
whose expression is exactly that call reopens as the mapping form, anything else as raw
jq.

A bound state or template absent on the server renders the raw jq read-only under a
`template not attached` error, never a blank form. When the edited binding names a
state the target's own (`inherited`) binding also names, the state card warns
`Overrides the preset's subject` and shows the inherited subject/scope.
