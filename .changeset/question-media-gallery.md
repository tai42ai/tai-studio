---
'@tai42/api-client': minor
'@tai42/studio-sdk': minor
'@tai42/feature-interactions': minor
---

Question media: render an `ask_user` question's optional display-only media (images
and/or links) in the interactions inbox. The `interaction.add` frame gains a loose
optional `media` array (`interactionMediaItem` is applied per item by the renderer),
and the stream hook carries it through. A new feature-local `MediaGallery` renders
each item behind a per-item scheme gate — images only for an `https:` URL or a
`data:image/` URI (with `referrerPolicy="no-referrer"`), links via the scheme-gated
`ExternalLinkButton` — with a loud visible notice for a malformed item, a blocked
image src, or a failed image load. Media is display-only: no answer, callback, or
lifecycle behavior changes.
