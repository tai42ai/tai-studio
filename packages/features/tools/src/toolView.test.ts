/**
 * The merge rules `buildToolViews` is the sole owner of. Badges mirror tags exactly:
 * the view exposes native and overlay apart (the edit dialog wants them apart) AND
 * their deduped, sorted UNION (every other surface shows the merged set).
 */
import { describe, expect, it } from 'vitest';
import type { ToolMetaRecord, ToolTagEntry } from '@tai42/api-client';

import { buildToolViews } from './toolView';

const tagEntry = (overrides: Partial<ToolTagEntry> & { name: string }): ToolTagEntry => ({
  tags: [],
  badges: [],
  hidden: false,
  ...overrides,
});

const overlayRow = (
  overrides: Partial<ToolMetaRecord> & { tool_name: string },
): ToolMetaRecord => ({
  display_name: null,
  folder_id: null,
  tags: [],
  badges: [],
  hidden: null,
  ...overrides,
});

describe('buildToolViews — badges', () => {
  it('unions native and overlay badges, deduped and sorted', () => {
    const [view] = buildToolViews(
      ['echo'],
      [tagEntry({ name: 'echo', badges: ['network', 'shared'] })],
      [overlayRow({ tool_name: 'echo', badges: ['filesystem', 'shared'] })],
    );
    expect(view?.nativeBadges).toEqual(['network', 'shared']);
    expect(view?.overlayBadges).toEqual(['filesystem', 'shared']);
    expect(view?.badges).toEqual(['filesystem', 'network', 'shared']);
  });

  it('falls back to empty badge lists when neither side declares any', () => {
    const [view] = buildToolViews(['echo'], [tagEntry({ name: 'echo' })], []);
    expect(view?.nativeBadges).toEqual([]);
    expect(view?.overlayBadges).toEqual([]);
    expect(view?.badges).toEqual([]);
  });

  it('carries a native-only badge through when no overlay row exists', () => {
    const [view] = buildToolViews(['echo'], [tagEntry({ name: 'echo', badges: ['network'] })], []);
    expect(view?.badges).toEqual(['network']);
  });

  it('carries an overlay-only badge through when the tool declares none', () => {
    const [view] = buildToolViews(
      ['echo'],
      [tagEntry({ name: 'echo' })],
      [overlayRow({ tool_name: 'echo', badges: ['audited'] })],
    );
    expect(view?.badges).toEqual(['audited']);
  });
});
