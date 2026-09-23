"""Parity guard between the two skeleton boot manifests.

Two manifests drive two boots of the same Studio SPA: the lean e2e boot
(``boot/manifest.yml``) wires exactly the surface the Playwright suites drive,
and the docs-demo boot (``docs-demo/manifest.yml``) is a deliberate SUPERSET
that loads every UI-facing router plus the real plugins so the screenshot
pipeline renders populated content.

The invariant: every registered capability a validated e2e screen depends on —
a tool-extension attachment, an HTTP router, an extension surface, the task
backend, a tool module — must also be present in the docs-demo boot, or a screen
proven against the e2e boot cannot render in the docs boot. The comparison runs
through the real ``tai42_contract.manifest.Manifest``: construction validates
each manifest and normalises every ``extensions`` block to a single canonical
shape (``dict[base, list[list[element]]]``), so the guard compares meaning, not
YAML text. A malformed manifest raises its pydantic error loudly at construction.

Blocks that legitimately differ between the boots — ``lifecycle_modules``
(boot-specific verifier vs accounts identity wiring), ``user_tools`` and
``studio_plugins`` (per-boot display curation), and every docs-demo-only screen
surface (``agents``, ``storage_module``, ``monitoring_module``, extra routers) —
are outside the rule set: they name no cross-boot capability a validated screen
inherits, so a superset assertion over them would falsely fail. Runtime-seeded
data, ports and paths are never manifest-declared and so are absent by
construction.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from tai42_contract.manifest import Manifest

_HERE = Path(__file__).parent


def _load(name: str) -> Manifest:
    """Construct a contract ``Manifest`` from a boot manifest YAML.

    A construction error (malformed manifest) surfaces its pydantic error.
    """
    data = yaml.safe_load((_HERE / name).read_text())
    return Manifest(**data)


BOOT = _load("boot/manifest.yml")
DOCS = _load("docs-demo/manifest.yml")


# One extension combo element in hashable canonical form: a bare name stays the
# name; a ``{"name", "config"}`` element becomes ``(name, <ordered config>)`` so
# an author-bound config is distinguished but its key order does not matter.
CanonElement = str | tuple[str, str]


def _canon_element(element: str | dict[str, Any]) -> CanonElement:
    if isinstance(element, str):
        return element
    config = element["config"]
    return (element["name"], yaml.safe_dump(config, sort_keys=True))


def _canon_combo(combo: list[str | dict[str, Any]]) -> frozenset[CanonElement]:
    """Canonicalise a combo so element order and spelling do not matter."""
    return frozenset(_canon_element(element) for element in combo)


def _attachment_map(manifest: Manifest) -> dict[str, set[frozenset[CanonElement]]]:
    """Union each manifest's per-entry ``extensions`` into one attachment map.

    Mirrors the skeleton's own union across ``tools + mcp`` plus
    ``api_tools.extensions`` (the contract has already normalised each block to
    ``dict[base, list[list[element]]]``); a contract ``Manifest`` never fills its
    own ``tool_extensions``, so the map is rebuilt here from the source blocks.
    """
    attachments: dict[str, set[frozenset[CanonElement]]] = {}
    sources = [cfg.extensions for cfg in [*manifest.tools, *manifest.mcp]]
    sources.append(manifest.api_tools.extensions)
    for extensions in sources:
        for base, combos in extensions.items():
            bucket = attachments.setdefault(base, set())
            for combo in combos:
                bucket.add(_canon_combo(combo))
    return attachments


def _render_element(element: CanonElement) -> str:
    if isinstance(element, str):
        return element
    name, config = element
    return f"{name}(config={config.strip()})"


def _render_combo(combo: frozenset[CanonElement]) -> str:
    return "[" + ", ".join(sorted(_render_element(element) for element in combo)) + "]"


def test_tool_extension_attachments_superset() -> None:
    """Rule 1 — every tool-extension combo the e2e boot attaches, docs-demo attaches.

    The schedule dialog's tool picker offers a base tool only when its
    ``_schedule_task`` vehicle is registered, and that vehicle exists only when
    the backend's ``schedule_task`` extension is attached to the tool.
    """
    boot_map = _attachment_map(BOOT)
    docs_map = _attachment_map(DOCS)
    problems: list[str] = []
    for base, boot_combos in sorted(boot_map.items()):
        docs_combos = docs_map.get(base)
        if docs_combos is None:
            rendered = ", ".join(_render_combo(combo) for combo in sorted(boot_combos, key=repr))
            problems.append(
                f"docs-demo manifest lacks tool extension attachment {base}: {rendered}"
            )
            continue
        missing = boot_combos - docs_combos
        if missing:
            rendered = ", ".join(_render_combo(combo) for combo in sorted(missing, key=repr))
            problems.append(
                f"docs-demo manifest is missing extension combo(s) {rendered} on tool "
                f"'{base}' that the e2e boot attaches"
            )
    assert not problems, "; ".join(problems)


def test_routers_superset() -> None:
    """Rule 2 — every API door the e2e boot mounts, docs-demo mounts."""
    missing = sorted(set(BOOT.routers_modules) - set(DOCS.routers_modules))
    assert not missing, (
        f"docs-demo manifest is missing router module(s) {missing} that the e2e boot mounts"
    )


def test_extension_modules_superset() -> None:
    """Rule 3 — every extension surface the e2e boot registers, docs-demo registers."""
    missing = sorted(set(BOOT.extensions_modules) - set(DOCS.extensions_modules))
    assert not missing, (
        f"docs-demo manifest is missing extension module(s) {missing} that the e2e boot registers"
    )


def test_backend_module_matches() -> None:
    """Rule 4 — when the e2e boot names a task backend, docs-demo names the same one.

    The tool-extension vehicles are registered by the backend, so the backend
    that supplies them must match. A deliberate switch is an explicit edit here.
    """
    if BOOT.backend_module is not None:
        assert DOCS.backend_module == BOOT.backend_module, (
            f"docs-demo manifest backend_module is {DOCS.backend_module!r}, but the e2e boot "
            f"names {BOOT.backend_module!r}; the tool-extension vehicles are registered by the "
            f"backend, so both boots must name the same one"
        )


def test_tool_modules_superset() -> None:
    """Rule 5 — every tool module the e2e boot registers, docs-demo registers."""
    missing = sorted({cfg.module for cfg in BOOT.tools} - {cfg.module for cfg in DOCS.tools})
    assert not missing, (
        f"docs-demo manifest is missing tool module(s) {missing} that the e2e boot registers"
    )
