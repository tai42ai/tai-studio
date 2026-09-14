import { describe, expect, it, vi } from 'vitest';

import type { DragEndEvent } from '@dnd-kit/core';

import {
  resolveDrop,
  dropFromDragEvent,
  dispatchDrop,
  scopeGroupsOf,
  subMcpPattern,
} from './scope-mapping';
import type { ChipData, ZoneRef } from './ScopeItemChip';

describe('resolveDrop', () => {
  const routeChip = (origin: ZoneRef): ChipData => ({
    url: '/c',
    itemType: 'route',
    slug: null,
    origin,
    methods: ['GET'],
  });
  const subMcpChip = (origin: ZoneRef): ChipData => ({
    url: '/app/y',
    itemType: 'sub-mcp',
    slug: 'y',
    origin,
    methods: [],
  });

  it('maps a route chip onto a scope with a plain body', () => {
    const action = resolveDrop(routeChip({ kind: 'unassigned' }), {
      zone: { kind: 'scope', scopeId: 's1' },
    });
    expect(action).toEqual({ kind: 'assign', body: { scope_id: 's1', url: '/c' } });
  });

  it('carries the subtree pattern for a sub-MCP chip dropped on a scope', () => {
    const action = resolveDrop(subMcpChip({ kind: 'unassigned' }), {
      zone: { kind: 'scope', scopeId: 's2' },
    });
    expect(action).toEqual({
      kind: 'assign',
      body: { scope_id: 's2', url: '/app/y', pattern: subMcpPattern('y') },
    });
    expect(subMcpPattern('y')).toBe('^/app/y/.*$');
  });

  it('is a no-op for a same-zone drop', () => {
    const action = resolveDrop(routeChip({ kind: 'scope', scopeId: 's1' }), {
      zone: { kind: 'scope', scopeId: 's1' },
    });
    expect(action).toEqual({ kind: 'noop' });
  });

  it('is a no-op when dropped on the unassigned bucket or off any zone', () => {
    expect(
      resolveDrop(routeChip({ kind: 'scope', scopeId: 's1' }), { zone: { kind: 'unassigned' } }),
    ).toEqual({
      kind: 'noop',
    });
    expect(resolveDrop(routeChip({ kind: 'scope', scopeId: 's1' }), null)).toEqual({
      kind: 'noop',
    });
  });

  it('pins a chip dropped on the Public zone (sub-MCP carries its pattern)', () => {
    expect(resolveDrop(routeChip({ kind: 'unassigned' }), { zone: { kind: 'public' } })).toEqual({
      kind: 'pin',
      url: '/c',
    });
    expect(resolveDrop(subMcpChip({ kind: 'unassigned' }), { zone: { kind: 'public' } })).toEqual({
      kind: 'pin',
      url: '/app/y',
      pattern: subMcpPattern('y'),
    });
  });

  it('re-points a public chip into a scope as a plain assign', () => {
    const action = resolveDrop(routeChip({ kind: 'public' }), {
      zone: { kind: 'scope', scopeId: 's1' },
    });
    expect(action).toEqual({ kind: 'assign', body: { scope_id: 's1', url: '/c' } });
  });

  it('is a no-op re-dropping a public chip onto the Public zone', () => {
    expect(resolveDrop(routeChip({ kind: 'public' }), { zone: { kind: 'public' } })).toEqual({
      kind: 'noop',
    });
  });
});

describe('dropFromDragEvent', () => {
  const chip: ChipData = {
    url: '/c',
    itemType: 'route',
    slug: null,
    origin: { kind: 'unassigned' },
    methods: ['GET'],
  };
  const subMcp: ChipData = {
    url: '/app/y',
    itemType: 'sub-mcp',
    slug: 'y',
    origin: { kind: 'unassigned' },
    methods: [],
  };
  const event = (active: ChipData | undefined, zone: ZoneRef | undefined): DragEndEvent =>
    ({
      active: { data: { current: active } },
      over: zone === undefined ? null : { data: { current: { zone } } },
    }) as unknown as DragEndEvent;

  it('maps a route chip dropped over a scope to an assign action', () => {
    expect(dropFromDragEvent(event(chip, { kind: 'scope', scopeId: 's1' }))).toEqual({
      kind: 'assign',
      body: { scope_id: 's1', url: '/c' },
    });
  });

  it('carries the sub-MCP subtree pattern from the event to the assign body', () => {
    expect(dropFromDragEvent(event(subMcp, { kind: 'scope', scopeId: 's2' }))).toEqual({
      kind: 'assign',
      body: { scope_id: 's2', url: '/app/y', pattern: subMcpPattern('y') },
    });
  });

  it('resolves a drop over the Public zone to a pin action', () => {
    expect(dropFromDragEvent(event(chip, { kind: 'public' }))).toEqual({ kind: 'pin', url: '/c' });
  });

  it('is a no-op when released off any zone', () => {
    expect(dropFromDragEvent(event(chip, undefined))).toEqual({ kind: 'noop' });
  });

  it('is a no-op when the active chip carries no payload', () => {
    expect(dropFromDragEvent(event(undefined, { kind: 'scope', scopeId: 's1' }))).toEqual({
      kind: 'noop',
    });
  });
});

describe('dispatchDrop', () => {
  it('runs an assign action through the assign handler only', () => {
    const assign = vi.fn();
    const pin = vi.fn();
    dispatchDrop({ kind: 'assign', body: { scope_id: 's1', url: '/c' } }, { assign, pin });
    expect(assign).toHaveBeenCalledWith({ scope_id: 's1', url: '/c' });
    expect(pin).not.toHaveBeenCalled();
  });

  it('routes a pin action to the pin handler (the confirm), never the assign mutation', () => {
    const assign = vi.fn();
    const pin = vi.fn();
    dispatchDrop({ kind: 'pin', url: '/app/y', pattern: subMcpPattern('y') }, { assign, pin });
    expect(pin).toHaveBeenCalledWith('/app/y', '^/app/y/.*$');
    expect(assign).not.toHaveBeenCalled();
  });

  it('does nothing for a no-op action', () => {
    const assign = vi.fn();
    const pin = vi.fn();
    dispatchDrop({ kind: 'noop' }, { assign, pin });
    expect(assign).not.toHaveBeenCalled();
    expect(pin).not.toHaveBeenCalled();
  });
});

describe('scopeGroupsOf', () => {
  it('inverts the {url: scope_id} map into sorted per-scope url lists', () => {
    const groups = scopeGroupsOf({ '/b': 's1', '/a': 's1', '/app/x': 's2' });
    expect(groups.get('s1')).toEqual(['/a', '/b']);
    expect(groups.get('s2')).toEqual(['/app/x']);
  });
});
