# Static public assets

Vite copies this directory verbatim to the built SPA root, so every file in it is
served unauthenticated at the deployment origin — this one included. It carries
the attribution the served assets require and nothing else: the design and
security notes for the pages and scripts here are docblocks in those files, where
they are read by the people who edit them rather than by everyone who can reach
the site.

## Brand marks

`tai42-logo-icon.png` (155x155) is the tab favicon, wired from `index.html`;
`apple-touch-icon.png` (180x180) is its iOS home-screen counterpart.
`tai42-logo-icon-dark.png` is the same mark redrawn for dark surfaces, for the
shell to select: the gradient runs to near-black at one end, so the light mark is
not legible against a dark ground.

## Font licences

`licenses/inter-OFL.txt` and `licenses/geist-mono-OFL.txt` are the upstream
copyright notices and SIL Open Font License 1.1 text for the two families the
build materialises into `assets/*.woff2`. OFL-1.1 §2 requires the notice and the
licence to accompany the redistributed font binaries, and this directory is the
only part of the build that is served verbatim, so they live here rather than in
the repository alone. `font-licences.test.ts` keeps a file here for every
`@fontsource-variable/*` the SDK depends on.
