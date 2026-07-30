import { describe, expect, it } from 'vitest';
import type { ComponentType } from 'react';
import type { PluginPageParamsSchema, PluginPageProps, RegisteredPage } from '@tai42/studio-sdk';

import { resolvePluginPage } from './plugin-page-resolve';

const Component: ComponentType<PluginPageProps> = () => null;

function page(path: string, params?: PluginPageParamsSchema): RegisteredPage {
  return { pluginId: 'acme', path, title: path, component: Component, params };
}

const NO_SEARCH: Record<string, unknown> = {};

describe('resolvePluginPage', () => {
  it('is not-found when no page matches the path', () => {
    expect(resolvePluginPage([page('demo')], 'missing', NO_SEARCH).status).toBe('not-found');
  });

  it('matches a schemaless page only on its EXACT path, forwarding no params/search', () => {
    const resolution = resolvePluginPage([page('demo')], 'demo', { q: 'x' });
    expect(resolution.status).toBe('matched');
    if (resolution.status !== 'matched') throw new Error('expected match');
    expect(resolution.params).toBeUndefined();
    expect(resolution.search).toBeUndefined();
  });

  it('does NOT match a sub-path against a schemaless page', () => {
    expect(resolvePluginPage([page('demo')], 'demo/extra', NO_SEARCH).status).toBe('not-found');
  });

  it('consumes the sub-path remainder as params when the page declares parseParams', () => {
    const schema: PluginPageParamsSchema = { parseParams: (remainder) => ({ flow: remainder }) };
    const resolution = resolvePluginPage([page('flows', schema)], 'flows/myflow', NO_SEARCH);
    expect(resolution.status).toBe('matched');
    if (resolution.status !== 'matched') throw new Error('expected match');
    expect(resolution.params).toEqual({ flow: 'myflow' });
  });

  it('passes the EMPTY remainder to parseParams on an exact match', () => {
    const schema: PluginPageParamsSchema = { parseParams: (remainder) => ({ flow: remainder }) };
    const resolution = resolvePluginPage([page('flows', schema)], 'flows', NO_SEARCH);
    if (resolution.status !== 'matched') throw new Error('expected match');
    expect(resolution.params).toEqual({ flow: '' });
  });

  it('validates and shapes the raw search through parseSearch', () => {
    const schema: PluginPageParamsSchema = {
      parseSearch: (raw) => ({ dir: typeof raw.dir === 'string' ? raw.dir : 'root' }),
    };
    const resolution = resolvePluginPage([page('flows', schema)], 'flows', { dir: 'eu' });
    if (resolution.status !== 'matched') throw new Error('expected match');
    expect(resolution.search).toEqual({ dir: 'eu' });
  });

  it('picks the LONGEST registered prefix among matches', () => {
    const parseParams = (remainder: string): Record<string, unknown> => ({ rest: remainder });
    const pages = [page('a', { parseParams }), page('a/b', { parseParams })];
    const resolution = resolvePluginPage(pages, 'a/b/c', NO_SEARCH);
    if (resolution.status !== 'matched') throw new Error('expected match');
    expect(resolution.page.path).toBe('a/b');
    expect(resolution.params).toEqual({ rest: 'c' });
  });

  it('is invalid (loud) when parseParams throws', () => {
    const schema: PluginPageParamsSchema = {
      parseParams: () => {
        throw new Error('bad flow id');
      },
    };
    const resolution = resolvePluginPage([page('flows', schema)], 'flows/x', NO_SEARCH);
    expect(resolution.status).toBe('invalid');
    if (resolution.status !== 'invalid') throw new Error('expected invalid');
    expect(resolution.error).toBe('bad flow id');
  });

  it('is invalid when parseSearch throws', () => {
    const schema: PluginPageParamsSchema = {
      parseSearch: () => {
        throw new Error('bad search');
      },
    };
    const resolution = resolvePluginPage([page('flows', schema)], 'flows', { dir: 1 });
    expect(resolution.status).toBe('invalid');
    if (resolution.status !== 'invalid') throw new Error('expected invalid');
    expect(resolution.error).toBe('bad search');
  });
});
