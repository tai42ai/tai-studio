// Re-vendor the published contract JSON-schema bundle, then regenerate the served
// schemas from it. This is the only step that reaches outside the Studio tree, so it
// runs by hand when bumping the pinned contract major, never in the node gate.
//
// Point it at a local checkout of the contract package that ships the bundle:
//   TAI42_CONTRACT_SCHEMA=/abs/path/to/contract-schema.json  (the bundle file), or
//   TAI42_REPO=/abs/path/to/contract-checkout                (the file is derived
//                                                             from the repo root)

import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const VENDORED = resolve(here, '../contract-schema/contract-schema.json');
const GENERATOR = resolve(here, 'gen-schemas.mjs');
// Operations setting: where the contract package keeps the bundle inside its repo,
// used only to derive the file from a TAI42_REPO root.
const REPO_RELATIVE = 'core/contract/src/tai42_contract/schemas/contract-schema.json';

const resolveSource = () => {
  const direct = process.env.TAI42_CONTRACT_SCHEMA;
  if (direct) return resolve(direct);
  const repo = process.env.TAI42_REPO;
  if (repo) return resolve(repo, REPO_RELATIVE);
  throw new Error(
    'Set TAI42_CONTRACT_SCHEMA (path to the published contract-schema.json) or ' +
      'TAI42_REPO (path to a contract checkout of the pinned major).',
  );
};

const source = resolveSource();
if (!existsSync(source)) {
  throw new Error(`Contract bundle not found at ${source}.`);
}

const version = JSON.parse(readFileSync(source, 'utf8')).contract_version;
copyFileSync(source, VENDORED);
console.log(`Vendored contract-schema.json (contract_version ${version}) from ${source}`);

execFileSync(process.execPath, [GENERATOR], { stdio: 'inherit' });
