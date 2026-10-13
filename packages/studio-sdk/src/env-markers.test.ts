import { describe, expect, it } from 'vitest';

import { collectEnvRefs, ENV_MARKER_PREFIX, formatEnvMarker, parseEnvMarker } from './env-markers';

describe('env markers', () => {
  it('names the marker prefix: the tag and exactly one space', () => {
    expect(ENV_MARKER_PREFIX).toBe('!ENV ');
  });

  it('formats and parses a bare marker and one carrying a default', () => {
    expect(formatEnvMarker('TOKEN')).toBe('!ENV ${TOKEN}');
    expect(formatEnvMarker('REGION', 'eu-1')).toBe('!ENV ${REGION:eu-1}');
    expect(parseEnvMarker('!ENV ${TOKEN}')).toEqual({ key: 'TOKEN' });
    expect(parseEnvMarker('!ENV ${REGION:eu-1}')).toEqual({ key: 'REGION', default: 'eu-1' });
    expect(parseEnvMarker('!ENV ${URL:https://x:8080}')).toEqual({
      key: 'URL',
      default: 'https://x:8080',
    });
  });

  it.each([
    ['X', ''],
    ['X', 'a}b'],
    ['A:B', undefined],
    ['A{B', undefined],
    ['', undefined],
  ])('refuses to format a marker the grammar cannot read back (%j, %j)', (key, defaultValue) => {
    expect(() => formatEnvMarker(key, defaultValue)).toThrow('cannot be written as an !ENV marker');
  });

  it('parses only a leaf that is exactly one reference', () => {
    expect(parseEnvMarker('!ENV ${A}${B}')).toBeNull();
    expect(parseEnvMarker('!ENV prefix-${A}')).toBeNull();
    expect(parseEnvMarker('!ENV ${A} tail')).toBeNull();
    expect(parseEnvMarker('!ENV  ${A}')).toBeNull();
    expect(parseEnvMarker('!ENV ${A{B}')).toBeNull();
    expect(parseEnvMarker('${A}')).toBeNull();
    expect(parseEnvMarker(3)).toBeNull();
    expect(parseEnvMarker(null)).toBeNull();
  });

  it('collects every referenced name of every marker leaf, defaults stripped', () => {
    const refs = collectEnvRefs({
      a: '!ENV ${A}',
      b: ['!ENV ${B:fallback}', { c: '!ENV ${C}-${D:x}' }],
      literal: '${NOT_A_MARKER}',
      n: 7,
    });
    expect([...refs].sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('collects nothing from a leaf with a brace in the name', () => {
    expect([...collectEnvRefs('!ENV ${A{B}')]).toEqual([]);
  });
});
