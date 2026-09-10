/**
 * The query-key factory: keys are stable tuples, a subject's identity distinguishes two
 * subjects of the same state, and the template/target reads sit as siblings of the list.
 */
import { describe, expect, it } from 'vitest';
import {
  statesListKey as sdkStatesListKey,
  stateTemplatesKey as sdkStateTemplatesKey,
} from '@tai42/studio-sdk';

import {
  conversationTargetsKey,
  stateConsumersKey,
  stateDetailKey,
  stateTemplatesKey,
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
  it('the list, template and target reads share the root but are distinct siblings', () => {
    expect(statesListKey).toEqual(['states', 'list']);
    expect(stateTemplatesKey).toEqual(['states', 'state-templates']);
    expect(conversationTargetsKey).toEqual(['states', 'targets']);
  });

  it('the catalog keys ARE the SDK seam constants the binding door screens fetch under', () => {
    // The binding-editor consumers (presets, routes, hooks, schedules) key these reads
    // from the SDK; the states feature re-exports the same constant, so both hit one
    // cache slot and a single fetch serves both.
    expect(statesListKey).toBe(sdkStatesListKey);
    expect(stateTemplatesKey).toBe(sdkStateTemplatesKey);
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
