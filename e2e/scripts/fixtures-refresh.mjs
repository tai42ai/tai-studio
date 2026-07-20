/**
 * `pnpm fixtures:refresh`. Captures the ALLOW-LISTED GET responses from the
 * running e2e boot skeleton into `packages/api-client/fixtures/`, so the
 * api-client's zod schemas are validated against real Pydantic-emitted shapes.
 *
 * Only endpoints on the FIXTURE_ENDPOINTS allow-list are captured; the capture set
 * is guarded (assertCaptureSetSafe) BEFORE anything is written, so a secret-bearing
 * endpoint can never be captured into these public fixtures. The envelope is
 * unwrapped — the fixture stores the `{"data": ...}` payload the schema validates.
 *
 * Requires the boot skeleton up (e2e/boot/boot.sh) and STUDIO_API_KEY set to the
 * seeded key.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  FIXTURE_ENDPOINTS,
  assertCaptureSetSafe,
} from '../../packages/api-client/fixtures/contract.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(scriptDir, '../../packages/api-client/fixtures');

const API_KEY = process.env.STUDIO_API_KEY;
if (!API_KEY) {
  throw new Error(
    'STUDIO_API_KEY is required (the seeded e2e key) — refusing to capture without it.',
  );
}
const PORT = process.env.STUDIO_PORT ?? '8765';
const BASE_URL = process.env.STUDIO_BASE_URL ?? `http://127.0.0.1:${PORT}`;

async function capture(endpoint) {
  const res = await fetch(`${BASE_URL}${endpoint.path}`, {
    headers: { 'x-api-key': API_KEY, accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`GET ${endpoint.path} -> ${String(res.status)} (${await res.text()})`);
  }
  const body = await res.json();
  if (!(typeof body === 'object' && body !== null && 'data' in body)) {
    throw new Error(`GET ${endpoint.path} did not return a {"data": ...} envelope`);
  }
  const outPath = resolve(fixturesDir, `${endpoint.name}.json`);
  writeFileSync(outPath, JSON.stringify(body.data, null, 2) + '\n', 'utf8');
  return outPath;
}

async function main() {
  // Fail closed BEFORE any network call — a misconfigured allow-list must never
  // even attempt to capture a secret-bearing endpoint.
  assertCaptureSetSafe();
  mkdirSync(fixturesDir, { recursive: true });
  for (const endpoint of FIXTURE_ENDPOINTS) {
    const out = await capture(endpoint);
    console.log(`captured ${endpoint.path} -> ${out}`);
  }
  console.log(`\n${String(FIXTURE_ENDPOINTS.length)} fixtures written to ${fixturesDir}`);
}

await main();
