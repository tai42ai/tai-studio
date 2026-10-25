/**
 * The Pick tools section model: the initial ticks from the read, the body a save
 * writes in each mode, the blocked include draft and the count line.
 */
import type { McpAdvertisedTool, McpAdvertisedTools } from '@tai42/api-client';
import { describe, expect, it } from 'vitest';

import {
  countLine,
  draftBlocked,
  draftBody,
  initialDraft,
  listedNames,
  pickMode,
  sameBody,
} from './pick-tools-model';

function tool(name: string, selected: boolean): McpAdvertisedTool {
  return {
    name,
    selected,
    bound: selected,
    title: null,
    description: null,
    unbound_reason: selected ? null : 'not_listed_at_bind',
  };
}

function read(overrides: Partial<McpAdvertisedTools> = {}): McpAdvertisedTools {
  return {
    title: 'acme',
    include: [],
    exclude: [],
    tools: [tool('acme_send', true), tool('acme_read', true)],
    unadvertised: [],
    ...overrides,
  };
}

describe('pickMode and listedNames', () => {
  it('is include mode unless the stored exclude list holds a name', () => {
    expect(pickMode(read())).toBe('include');
    expect(pickMode(read({ include: ['acme_send'] }))).toBe('include');
    expect(pickMode(read({ exclude: ['acme_read'] }))).toBe('exclude');
  });

  it('lists the advertised tools, then the unadvertised names', () => {
    expect(listedNames(read({ unadvertised: ['acme_old'] }))).toEqual([
      'acme_send',
      'acme_read',
      'acme_old',
    ]);
  });
});

describe('initialDraft and draftBody', () => {
  it('writes the empty lists for a server with no stored filter', () => {
    const r = read();
    const draft = initialDraft(r);
    expect(draft.all).toBe(true);
    expect(draftBody(r, draft)).toEqual({ include: [], exclude: [] });
  });

  it('writes the ticked names as the include list', () => {
    const r = read({
      include: ['acme_send'],
      tools: [tool('acme_send', true), tool('acme_read', false)],
    });
    const draft = initialDraft(r);
    expect(draft.all).toBe(false);
    expect(draftBody(r, draft)).toEqual({ include: ['acme_send'], exclude: [] });
    expect(draftBody(r, { ...draft, ticks: { ...draft.ticks, acme_read: true } })).toEqual({
      include: ['acme_send', 'acme_read'],
      exclude: [],
    });
  });

  it('keeps an unadvertised include name ticked and written, and drops it once unticked', () => {
    const r = read({
      include: ['acme_send', 'acme_old'],
      tools: [tool('acme_send', true), tool('acme_read', false)],
      unadvertised: ['acme_old'],
    });
    const draft = initialDraft(r);
    expect(draft.ticks.acme_old).toBe(true);
    expect(draftBody(r, draft)).toEqual({ include: ['acme_send', 'acme_old'], exclude: [] });
    expect(draftBody(r, { ...draft, ticks: { ...draft.ticks, acme_old: false } })).toEqual({
      include: ['acme_send'],
      exclude: [],
    });
  });

  it('keeps exclude mode and writes the unticked names, never an include list', () => {
    const r = read({
      exclude: ['acme_read', 'acme_old'],
      tools: [tool('acme_send', true), tool('acme_read', false)],
      unadvertised: ['acme_old'],
    });
    const draft = initialDraft(r);
    expect(draft.ticks.acme_old).toBe(false);
    expect(draftBody(r, draft)).toEqual({ include: [], exclude: ['acme_read', 'acme_old'] });
    expect(draftBody(r, { ...draft, ticks: { ...draft.ticks, acme_read: true } })).toEqual({
      include: [],
      exclude: ['acme_old'],
    });
  });

  it('writes every listed name as excluded when exclude mode has nothing ticked', () => {
    const r = read({
      exclude: ['acme_read'],
      tools: [tool('acme_send', true), tool('acme_read', false)],
      unadvertised: ['acme_old'],
    });
    const draft = { all: false, ticks: { acme_send: false, acme_read: false, acme_old: false } };
    expect(draftBody(r, draft)).toEqual({
      include: [],
      exclude: ['acme_send', 'acme_read', 'acme_old'],
    });
    expect(draftBlocked(r, draft)).toBe(false);
  });

  it('writes the empty lists when the all-checkbox is on over a stored list', () => {
    const r = read({ include: ['acme_send'] });
    const draft = { ...initialDraft(r), all: true };
    expect(draftBody(r, draft)).toEqual({ include: [], exclude: [] });
  });
});

describe('draftBlocked', () => {
  it('blocks an include draft with nothing ticked and the all-checkbox off', () => {
    const r = read({ include: ['acme_send'] });
    expect(draftBlocked(r, { all: false, ticks: { acme_send: false, acme_read: false } })).toBe(
      true,
    );
    expect(draftBlocked(r, { all: true, ticks: { acme_send: false, acme_read: false } })).toBe(
      false,
    );
    expect(draftBlocked(r, { all: false, ticks: { acme_send: true, acme_read: false } })).toBe(
      false,
    );
  });
});

describe('sameBody', () => {
  it('compares the lists as sets', () => {
    expect(
      sameBody({ include: ['a', 'b'], exclude: [] }, { include: ['b', 'a'], exclude: [] }),
    ).toBe(true);
    expect(sameBody({ include: ['a'], exclude: [] }, { include: ['a', 'b'], exclude: [] })).toBe(
      false,
    );
    expect(sameBody({ include: [], exclude: ['a'] }, { include: [], exclude: ['b'] })).toBe(false);
  });
});

describe('countLine', () => {
  it('counts the picked tools in include mode and the kept unadvertised names', () => {
    const r = read({ include: ['acme_send', 'acme_old'], unadvertised: ['acme_old'] });
    expect(
      countLine(r, { all: false, ticks: { acme_send: true, acme_read: false, acme_old: true } }),
    ).toBe('1 of 2 tools picked · 1 not advertised kept');
    expect(countLine(read(), initialDraft(read()))).toBe('2 of 2 tools picked');
  });

  it('counts the mounted tools in exclude mode and the still-excluded unadvertised names', () => {
    const r = read({ exclude: ['acme_read', 'acme_old'], unadvertised: ['acme_old'] });
    expect(
      countLine(r, { all: false, ticks: { acme_send: false, acme_read: false, acme_old: false } }),
    ).toBe('0 of 2 tools mounted · 1 not advertised still excluded');
  });
});
