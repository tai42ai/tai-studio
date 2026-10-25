/**
 * Unit tests for the pure install-mount model: the env collection, the per-var secret
 * band derivation and the install/update body assembly (route-mount diff + env
 * attachment).
 */
import type { MarketplaceInstallPreview } from '@tai42/api-client';
import { describe, expect, it } from 'vitest';

import { buildInstallExtras, collectEnv, deriveEnvSecretMap } from './install-mount';

describe('collectEnv', () => {
  it('omits a blank var and masks a filled var only when its toggle is on', () => {
    const { env, secretKeys } = collectEnv(
      ['A', 'B', 'C'],
      { A: 'a', B: '', C: 'c' },
      { A: true, C: false },
    );
    // B is blank → omitted entirely; A's toggle is on → masked; C's toggle is off.
    expect(env).toEqual({ A: 'a', C: 'c' });
    expect(secretKeys).toEqual(['A']);
  });

  it('masks only a var whose toggle is explicitly on: an off OR unset var stays out of secret_keys', () => {
    // A var ABSENT from the secret map (MARKER) is masked only if turned on.
    const { env, secretKeys } = collectEnv(
      ['CLIENT_ID', 'CLIENT_SECRET', 'MARKER'],
      { CLIENT_ID: 'id', CLIENT_SECRET: 'sh', MARKER: 'm' },
      { CLIENT_ID: false, CLIENT_SECRET: true },
    );
    expect(env).toEqual({ CLIENT_ID: 'id', CLIENT_SECRET: 'sh', MARKER: 'm' });
    expect(secretKeys).toEqual(['CLIENT_SECRET']);
  });
});

describe('deriveEnvSecretMap', () => {
  it('marks a var secret when the preview says so', () => {
    const preview = {
      required_env: [
        { name: 'TOKEN', secret: true },
        { name: 'ID', secret: false },
      ],
    } as unknown as MarketplaceInstallPreview;
    expect(deriveEnvSecretMap(['TOKEN', 'ID'], preview, undefined, {})).toEqual({
      TOKEN: true,
      ID: false,
    });
  });

  it('honors a caller-supplied band and an operator override', () => {
    expect(deriveEnvSecretMap(['A', 'B'], undefined, { A: true }, { B: true })).toEqual({
      A: true,
      B: true,
    });
  });
});

describe('buildInstallExtras', () => {
  it('sends every base on install', () => {
    const extras = buildInstallExtras('Install', { web: 'x' }, { web: 'x' }, false, [], {}, {});
    expect(extras).toEqual({ route_mounts: { web: 'x' }, accept_public_routes: false });
  });

  it('sends only changed bases on update', () => {
    const extras = buildInstallExtras(
      'Update',
      { web: 'y', api: 'a' },
      { web: 'x', api: 'a' },
      true,
      [],
      {},
      {},
    );
    expect(extras.route_mounts).toEqual({ web: 'y' });
    expect(extras.accept_public_routes).toBe(true);
  });

  it('attaches filled env and its secret keys', () => {
    const extras = buildInstallExtras(
      'Install',
      {},
      {},
      false,
      ['TOKEN', 'ID'],
      { TOKEN: 'abc', ID: '' },
      { TOKEN: true, ID: false },
    );
    expect(extras.env).toEqual({ TOKEN: 'abc' });
    expect(extras.secret_keys).toEqual(['TOKEN']);
  });

  it('omits env entirely when nothing was filled', () => {
    const extras = buildInstallExtras('Install', {}, {}, false, ['TOKEN'], {}, { TOKEN: true });
    expect(extras.env).toBeUndefined();
    expect(extras.secret_keys).toBeUndefined();
  });
});
