"""The tool extension the reference Studio plugin registers.

Listed under a manifest's ``extensions_modules``; importing it registers
``studio_demo_label``, a wrapper that declares one required ``label`` setting and
branches the wrapped tool into ``<tool>_studio_demo_label``, which runs the tool
unchanged. It gives the Studio's extension-set builder an extension whose settings
it renders as a form.
"""

from __future__ import annotations

import functools
import inspect
from collections.abc import Callable
from typing import Any

from tai42_contract.app import tai42_app
from tai42_contract.extensions import ExtensionKind

_CONFIG_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"label": {"type": "string", "minLength": 1, "title": "Label"}},
    "required": ["label"],
    "additionalProperties": False,
}


@tai42_app.extensions.extension(kind=ExtensionKind.WRAPPER, config_schema=_CONFIG_SCHEMA)
def studio_demo_label(
    func: Callable[..., Any], name: str, description: str, config: dict[str, Any]
) -> Callable[..., Any]:
    """Branch ``func`` under a new name; the ``label`` setting is checked by the server, not read."""
    if inspect.iscoroutinefunction(func):

        @functools.wraps(func)
        async def branch(*args: Any, **kwargs: Any) -> Any:
            return await func(*args, **kwargs)

    else:

        @functools.wraps(func)
        def branch(*args: Any, **kwargs: Any) -> Any:
            return func(*args, **kwargs)

    # The branch loop registers a branch by its ``__name__``, which must differ from
    # the wrapped tool's.
    branch.__name__ = f"{name}_studio_demo_label"
    return branch
