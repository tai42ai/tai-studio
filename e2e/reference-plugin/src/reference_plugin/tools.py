"""Tools exposed by the reference Studio plugin.

- ``studio_demo_echo`` is the tool the plugin's custom tool panel drives; it
  returns a structured payload the panel renders.
- ``studio_demo_form`` has a rich typed signature with no custom panel, so the
  Studio falls back to the auto-generated form and result viewer — the path the
  e2e suite exercises for the generic tool runner.
- ``studio_demo_fail`` always raises, so the suite can assert the error surfaces
  loudly in the result viewer rather than being swallowed.
- ``parking_ask`` asks and parks so a synchronous run returns a park: a caller
  ask surfaces as the caller-asks envelope the run panel lists, a user ask as the
  suspension receipt; ``parking_ask_resume`` is the resume continuation it binds.
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


def _ask_addressee(to: str) -> Literal["caller", "user"]:
    """Narrow ``to`` to an ask addressee, raising on any other value.

    The tool takes it as a plain ``str`` so the auto-form binder resolves it; a value
    that is neither ``"caller"`` nor ``"user"`` is refused loudly, never coerced.
    """
    if to == "caller":
        return "caller"
    if to == "user":
        return "user"
    raise ValueError(f"to must be 'caller' or 'user', got {to!r}")


@tai42_app.tools.tool
async def parking_ask(prompt: str, count: int = 1, to: str = "caller") -> object:
    """Ask ``count`` times and park, returning the run's suspension.

    Binds ``parking_ask_resume`` as the async park's resume continuation — the resuming
    driver a ``to="caller"`` async ask requires — then asks ``count`` times in one call,
    each parking at once. The per-ask suspensions are merged into one so the synchronous
    run-tool door returns the whole set: a caller park surfaces as the caller-asks
    envelope the run panel lists (one row per ask), a user park as the suspension receipt.
    A caller ask is subject-indexed, so the run must carry a subject.

    Args:
        prompt: The question text; multiple asks suffix their one-based position.
        count: How many asks to park in the one run; at least 1.
        to: ``"caller"`` (the calling run resumes it) or ``"user"`` (a person answers it).
    """
    from datetime import UTC, datetime, timedelta

    from tai42_contract.interactions import (
        SuspendedInteraction,
        reset_resume_continuation_tool,
        set_resume_continuation_tool,
    )

    from tai42_skeleton.interactions import ask

    if count < 1:
        raise ValueError("count must be at least 1")
    addressee = _ask_addressee(to)
    token = set_resume_continuation_tool("parking_ask_resume")
    try:
        suspensions: list[SuspendedInteraction] = []
        for index in range(count):
            marker = prompt if count == 1 else f"{prompt} ({index + 1})"
            expiry_at = datetime.now(UTC) + timedelta(hours=1)
            suspensions.append(await ask(marker, to=addressee, mode="async", expiry_at=expiry_at))
    finally:
        reset_resume_continuation_tool(token)
    # One driver call surfacing a whole step merges the per-ask sentinels' id lists, so
    # the visit reads every parked ask off the single returned suspension.
    first = suspensions[0]
    return SuspendedInteraction(
        interaction_id=first.interaction_id,
        expiry_at=first.expiry_at,
        resume_owner=first.resume_owner,
        interaction_ids=[suspension.interaction_id for suspension in suspensions],
        caller_interaction_ids=[
            suspension.interaction_id for suspension in suspensions if suspension.caller_interaction_ids
        ],
    )


@tai42_app.tools.tool
async def parking_ask_resume(interaction_id: str, answer: object) -> object:
    """Resume a parked ``parking_ask`` run with the answer, finalizing it.

    The resume continuation ``parking_ask`` binds: the platform re-enters the parked run
    under its restored call chain and hands this the parked id and the answer, which it
    returns as the run's final result.
    """
    return {"interaction_id": interaction_id, "answer": answer}
