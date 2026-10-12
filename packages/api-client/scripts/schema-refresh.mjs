// Re-vendor the platform's two published artifacts, then regenerate the client from them:
// the contract JSON-schema bundle (contract-schema/contract-schema.json) and the skeleton's
// OpenAPI artifact (contract-schema/openapi.json). This is the only step that reaches outside
// the Studio tree, so it runs by hand when the platform changes, never in the node gate.
//
// One input: TAI42_REPO=/abs/path/to/a/checkout/of/the/platform/repository. Both files are
// copied from that one checkout, so the two always come from the same platform tree.

import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const GENERATOR = resolve(here, 'gen-schemas.mjs');
// Operations setting: where the platform repository keeps each artifact, and where the
// Studio vendors it.
const ARTIFACTS = [
  {
    name: 'contract-schema.json',
    repoRelative: 'core/contract/src/tai42_contract/schemas/contract-schema.json',
    vendored: resolve(here, '../contract-schema/contract-schema.json'),
    version: (document) => `contract_version ${document.contract_version}`,
  },
  {
    name: 'openapi.json',
    repoRelative: 'core/skeleton/src/tai42_skeleton/schemas/openapi.json',
    vendored: resolve(here, '../contract-schema/openapi.json'),
    version: (document) => `info.version ${document.info.version}`,
  },
];

const repo = process.env.TAI42_REPO;
if (!repo) {
  throw new Error(
    'Set TAI42_REPO to a checkout of the platform repository (the source of both vendored artifacts).',
  );
}

const sources = ARTIFACTS.map((artifact) => ({
  ...artifact,
  source: resolve(repo, artifact.repoRelative),
}));
for (const { name, source } of sources) {
  if (!existsSync(source)) throw new Error(`${name} not found at ${source}.`);
}

for (const { name, source, vendored, version } of sources) {
  const document = JSON.parse(readFileSync(source, 'utf8'));
  copyFileSync(source, vendored);
  console.log(`Vendored ${name} (${version(document)}) from ${source}`);
}

execFileSync(process.execPath, [GENERATOR], { stdio: 'inherit' });
