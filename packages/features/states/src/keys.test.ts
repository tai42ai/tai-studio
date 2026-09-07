/**
 * The query-key factory: keys are stable tuples, a subject's identity distinguishes two
 * subjects of the same state, and the module/target reads sit as siblings of the list.
 */
import { describe, expect, it } from 'vitest';

import {
  conversationTargetsKey,
  stateConsumersKey,
  stateDetailKey,
  stateModulesKey,
  stateRecordKey,
  stateSearchKey,
  stateStatsKey,
  stateSubjectsKey,
  stateWritesKey,
  statesListKey,
  subjectIdentity,
} from './keys';

const subject = { target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'p-1' };
const other = { target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'p-2' };

describe('states query keys', () => {
  it('the list, module and target reads share the root but are distinct siblings', () => {
    expect(statesListKey).toEqual(['states', 'list']);
    expect(stateModulesKey).toEqual(['states', 'modules']);
    expect(conversationTargetsKey).toEqual(['states', 'targets']);
  });

  it('per-name keys carry the name', () => {
    expect(stateDetailKey('profile')).toEqual(['states', 'detail', 'profile']);
    expect(stateStatsKey('profile')).toEqual(['states', 'stats', 'profile']);
    expect(stateConsumersKey('profile')).toEqual(['states', 'consumers', 'profile']);
    expect(stateSubjectsKey('profile', 'person')).toEqual([
      'states',
      'subjects',
      'profile',
      'person',
    ]);
    expect(stateSearchKey('profile', 'q')).toEqual(['states', 'search', 'profile', 'q']);
  });

  it("a subject's identity distinguishes two subjects of one state", () => {
    expect(subjectIdentity(subject)).not.toBe(subjectIdentity(other));
    expect(stateRecordKey('profile', subject)).not.toEqual(stateRecordKey('profile', other));
    expect(stateWritesKey('profile', subject)[3]).toBe(subjectIdentity(subject));
  });
});
