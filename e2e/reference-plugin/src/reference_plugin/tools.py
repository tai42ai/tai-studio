"""Tools exposed by the reference Studio plugin.

- ``studio_demo_echo`` is the tool the plugin's custom tool panel drives; it
  returns a structured payload the panel renders.
- ``studio_demo_form`` has a rich typed signature with no custom panel, so the
  Studio falls back to the auto-generated form and result viewer — the path the
  e2e suite exercises for the generic tool runner.
- ``studio_demo_fail`` always raises, so the suite can assert the error surfaces
  loudly in the result viewer rather than being swallowed.
"""

from typing import Any, Literal

from tai42_contract.app import tai42_app


@tai42_app.tools.tool
async def studio_demo_echo(message: str, shout: bool = False) -> dict[str, Any]:
    """Echo a message back, optionally upper-cased.

    Args:
        message: Text to echo.
        shout: When true, the echoed text is upper-cased.

    Returns:
        A payload with the original and transformed message.
    """
    echoed = message.upper() if shout else message
    return {"original": message, "echoed": echoed, "shouted": shout}


@tai42_app.tools.tool
async def studio_demo_form(
    name: str,
    count: int = 1,
    mood: Literal["happy", "neutral", "grumpy"] = "neutral",
    loud: bool = False,
) -> dict[str, Any]:
    """Build a greeting from a typed set of fields.

    The mix of a required string, a bounded integer, an enum, and a boolean is
    what the Studio's auto-form renders for a tool that ships no custom panel.

    Args:
        name: Who to greet.
        count: How many times to repeat the greeting; must be at least 1.
        mood: Tone of the greeting.
        loud: When true, the greeting is upper-cased.

    Returns:
        The rendered greeting and the echoed inputs.
    """
    if count < 1:
        raise ValueError("count must be at least 1")
    punctuation = {"happy": "!", "neutral": ".", "grumpy": "..."}[mood]
    greeting = " ".join([f"Hello {name}{punctuation}"] * count)
    if loud:
        greeting = greeting.upper()
    return {"greeting": greeting, "inputs": {"name": name, "count": count, "mood": mood, "loud": loud}}


@tai42_app.tools.tool
async def studio_demo_fail(reason: str = "intentional failure") -> Any:
    """Always raise, so the Studio's error handling can be exercised.

    Args:
        reason: Message carried by the raised error.
    """
    raise RuntimeError(reason)
