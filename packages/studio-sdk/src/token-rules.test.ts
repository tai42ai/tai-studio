import { describe, expect, it } from 'vitest';

import { destructiveColorOffences, governingProperty } from './token-rules';

describe('governingProperty', () => {
  it('reads the property a value belongs to, past commas and parentheses in the value', () => {
    const source = 'background: linear-gradient(90deg, var(--x), transparent);';
    expect(governingProperty(source, source.indexOf('var(--x)'))).toBe('background');
  });

  it('reads a JSX style entry, not the entry before it', () => {
    const source = "{ background: '#fff', color: 'var(--x)' }";
    expect(governingProperty(source, source.indexOf('var(--x)'))).toBe('color');
  });

  it('finds nothing when a statement boundary separates the value from any name', () => {
    const source = '{ var(--x) }';
    expect(governingProperty(source, source.indexOf('var(--x)'))).toBeUndefined();
  });
});

describe('destructiveColorOffences', () => {
  it('flags a destructive token used as text colour, in CSS and in a JSX style', () => {
    const sample = [
      '.note { color: var(--tai-color-destructive); }',
      "const style = { margin: 0, color: 'var(--tai-color-destructive-hover)' };",
    ].join('\n');
    expect(destructiveColorOffences(sample)).toEqual(['color', 'color']);
  });

  it('accepts a destructive token on a fill or a border', () => {
    const sample = [
      '.chip { background: var(--tai-color-destructive); }',
      '.chip { border-color: var(--tai-color-destructive-hover); }',
      "const style = { background: 'var(--tai-color-destructive)' };",
    ].join('\n');
    expect(destructiveColorOffences(sample)).toEqual([]);
  });

  it('accepts the label colour inside the destructive button rule', () => {
    const sample = [
      '.tai-btn-danger {',
      '  background: var(--tai-color-destructive);',
      '  color: var(--tai-color-on-destructive);',
      '}',
      '.tai-btn-danger:hover:not(:disabled) { color: var(--tai-color-on-destructive); }',
    ].join('\n');
    expect(destructiveColorOffences(sample)).toEqual([]);
  });

  it('flags the same label colour in any other rule', () => {
    const sample = '.tai-btn-danger-like { color: var(--tai-color-on-destructive); }';
    expect(destructiveColorOffences(sample)).toEqual(['color']);
  });

  it('reports a reference whose property cannot be read', () => {
    expect(destructiveColorOffences('{ var(--tai-color-destructive) }')).toEqual([
      '<no property found>',
    ]);
  });

  it('reports offences in source order', () => {
    const sample = [
      '.a { color: var(--tai-color-destructive); }',
      '{ var(--tai-color-destructive) }',
      '.b { color: var(--tai-color-destructive-hover); }',
    ].join('\n');
    expect(destructiveColorOffences(sample)).toEqual(['color', '<no property found>', 'color']);
  });
});
