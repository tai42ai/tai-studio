import { describe, expect, it } from 'vitest';

import type { ToolMetaRecord, ToolTagEntry } from '@tai42/api-client';

import { mergeToolBadges, toolBadgesByName } from './tool-badges';

/** A native tag entry carrying only the plugin-declared badges under test. */
function tag(name: string, badges: string[]): ToolTagEntry {
  return { name, tags: [], badges, hidden: false };
}

/** An overlay row carrying only the operator badge overlay under test. */
function overlay(toolName: string, badges: string[]): ToolMetaRecord {
  return {
    tool_name: toolName,
    display_name: null,
    folder_id: null,
    tags: [],
    badges,
    hidden: null,
  };
}

describe('mergeToolBadges', () => {
  it('unions native and overlay badges, deduped and sorted', () => {
    expect(mergeToolBadges(['network'], ['audited'])).toEqual(['audited', 'network']);
  });

  it('drops a badge present in both sets', () => {
    expect(mergeToolBadges(['network', 'audited'], ['audited'])).toEqual(['audited', 'network']);
  });

  it('returns an empty list when neither source has badges', () => {
    expect(mergeToolBadges([], [])).toEqual([]);
  });
});

describe('toolBadgesByName', () => {
  it('maps each tool to its native ∪ overlay badges, deduped and sorted', () => {
    const map = toolBadgesByName(
      [tag('search_tool', ['network'])],
      [overlay('search_tool', ['audited', 'network'])],
    );
    expect(map).toEqual({ search_tool: ['audited', 'network'] });
  });

  it('omits a tool that declares no badges from either source', () => {
    const map = toolBadgesByName([tag('bare_tool', [])], []);
    expect(map.bare_tool).toBeUndefined();
  });

  it('surfaces an overlay-only badge for a tool carrying no native tag entry', () => {
    const map = toolBadgesByName([], [overlay('orphan', ['filesystem'])]);
    expect(map.orphan).toEqual(['filesystem']);
  });
});
