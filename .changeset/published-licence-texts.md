---
'@tai42/api-client': patch
'@tai42/studio-sdk': patch
---

Ship the licence texts inside both published packages. Each declares
`"license": "Apache-2.0"`, whose §4(a) requires a copy of the Licence to accompany
every distributed copy and §4(d) requires the NOTICE text to travel with it, and npm
auto-includes a licence only from the package directory — so a `LICENSE`/`NOTICE`
kept at the repository root reached neither tarball. Both now carry `LICENSE` and
`NOTICE`, and the SDK also packs the `SECURITY.md` its published `index.d.ts` banner
points a reader at.

A gate walks the workspace for every non-`private` manifest rather than naming the
packages, holds each copy byte-identical to the repository root's, and requires any
repository document a packed source cites to be packed alongside it.
