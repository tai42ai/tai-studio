import { describe, expect, it } from 'vitest';

import { assertApplyable } from './profile-apply';

describe('assertApplyable', () => {
  it('throws when handed refused keys (defense in depth)', () => {
    expect(() => {
      assertApplyable(['TAI_K8S_NAMESPACE']);
    }).toThrow(/refus/i);
  });

  it('permits an empty refused list', () => {
    expect(() => {
      assertApplyable([]);
    }).not.toThrow();
  });
});
