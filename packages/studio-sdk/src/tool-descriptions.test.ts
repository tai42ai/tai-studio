import type { ToolTagEntry } from '@tai42/api-client';
import { describe, expect, it } from 'vitest';

import { toolDescriptionsByName } from './tool-descriptions';

/** A native tag entry carrying only the declared description under test. */
function tag(name: string, description: string | null): ToolTagEntry {
  return { name, description, tags: [], badges: [], hidden: false, schedulable: false };
}

describe('toolDescriptionsByName', () => {
  it('maps each described tool to its declared description', () => {
    const map = toolDescriptionsByName([
      tag('search_tool', 'Finds matching records'),
      tag('echo', 'Returns its input'),
    ]);
    expect(map).toEqual({ search_tool: 'Finds matching records', echo: 'Returns its input' });
  });

  it('omits a tool that declares no description', () => {
    const map = toolDescriptionsByName([tag('bare_tool', null)]);
    expect(map).toEqual({});
  });

  it('omits a tool whose declared description is empty', () => {
    const map = toolDescriptionsByName([tag('blank_tool', '')]);
    expect(map).toEqual({});
  });
});
