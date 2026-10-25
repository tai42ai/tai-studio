"""The ``synthetic`` channel the reference Studio plugin registers.

Listed under a manifest's ``channel_modules``; importing it registers the channel
through ``tai42_app.channels.register`` as a real channel plugin does. It gives the
plugin's route panel (``studio-src/index.tsx``) a channel the server accepts a
conversation route on. It reaches no medium: ``resolve_address`` answers the send's
own pair, and every send raises :class:`ChannelDeliveryError`, so nothing is ever
reported as delivered.
"""

from __future__ import annotations

from tai42_contract.app import tai42_app
from tai42_contract.channels import (
    ChannelAddress,
    ChannelAddressError,
    ChannelDelivery,
    ChannelDeliveryError,
    ChannelNotification,
    SendOutcome,
)

SYNTHETIC_CHANNEL_NAME = "synthetic"


class SyntheticChannel:
    """A ``Channel`` with an address side and no medium behind it."""

    def resolve_address(self, recipient: str | None, sender_identity: str | None) -> ChannelAddress:
        if recipient is None or sender_identity is None:
            raise ChannelAddressError("the synthetic channel has no default recipient or identity")
        return ChannelAddress(our_identity=sender_identity, address=recipient)

    async def deliver(self, delivery: ChannelDelivery) -> SendOutcome:
        raise ChannelDeliveryError("the synthetic channel has no medium to deliver on")

    async def notify(self, notification: ChannelNotification) -> SendOutcome:
        raise ChannelDeliveryError("the synthetic channel has no medium to send on")


tai42_app.channels.register(SYNTHETIC_CHANNEL_NAME, SyntheticChannel())
