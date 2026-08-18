import { describe, expect, it } from 'vitest';

import type { ToolMetaRecord, ToolTagEntry } from '@tai42/api-client';

import { effectiveHidden, hiddenToolNames } from './tool-visibility';

/** A native tag entry with the given plugin-declared visibility. */
function tag(name: string, hidden: boolean, tags: string[] = []): ToolTagEntry {
  return { name, tags, badges: [], hidden };
}

/** An overlay row carrying only the tri-state `hidden` opinion under test. */
function overlay(toolName: string, hidden: boolean | null): ToolMetaRecord {
  return { tool_name: toolName, display_name: null, folder_id: null, tags: [], badges: [], hidden };
}

describe('effectiveHidden', () => {
  it('defers to the plugin declaration when the overlay has no opinion', () => {
    expect(effectiveHidden(null, true)).toBe(true);
    expect(effectiveHidden(null, false)).toBe(false);
    expect(effectiveHidden(undefined, true)).toBe(true);
    expect(effectiveHidden(undefined, false)).toBe(false);
  });

  it('lets an overlay opinion override the declaration in both directions', () => {
    // `false` UNHIDES a plugin-hidden tool; `true` force-hides a plugin-visible one.
    expect(effectiveHidden(false, true)).toBe(false);
    expect(effectiveHidden(true, false)).toBe(true);
  });
});

describe('hiddenToolNames', () => {
  it('excludes a plugin-hidden tool that has no overlay row', () => {
    const set = hiddenToolNames([tag('secret', true), tag('shown', false)], []);
    expect(set.has('secret')).toBe(true);
    expect(set.has('shown')).toBe(false);
  });

  it('keeps an overlay `false` (unhidden) tool OUT of the hidden set', () => {
    const set = hiddenToolNames([tag('secret', true)], [overlay('secret', false)]);
    expect(set.has('secret')).toBe(false);
  });

  it('includes an overlay `true` tool declared visible by its plugin', () => {
    const set = hiddenToolNames([tag('report', false)], [overlay('report', true)]);
    expect(set.has('report')).toBe(true);
  });

  it('defers to the declaration when the overlay row is `null`', () => {
    const set = hiddenToolNames([tag('secret', true)], [overlay('secret', null)]);
    expect(set.has('secret')).toBe(true);
  });

  it('catches an overlay-hidden tool carrying no native tag entry', () => {
    const set = hiddenToolNames([], [overlay('orphan', true)]);
    expect(set.has('orphan')).toBe(true);
  });
});
