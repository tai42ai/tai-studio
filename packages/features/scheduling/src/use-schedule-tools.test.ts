/**
 * The picker's schedulable-tool derivation: a base tool is offered only when its
 * `_schedule_task` vehicle is registered, and no vehicle row is ever offered. Driven
 * on the pure `pickableToolNames` so the rule is pinned apart from the dialog wiring.
 */
import { describe, expect, it } from 'vitest';

import { pickableToolNames } from './use-schedule-tools';

describe('pickableToolNames', () => {
  it('lists a base tool whose schedule vehicle is registered', () => {
    expect(pickableToolNames(['run_report', 'run_report_schedule_task'])).toEqual(['run_report']);
  });

  it('drops the `_schedule_task` vehicle rows themselves', () => {
    const result = pickableToolNames(['run_report', 'run_report_schedule_task']);
    expect(result).not.toContain('run_report_schedule_task');
  });

  it('drops a base tool that has no registered schedule vehicle', () => {
    expect(pickableToolNames(['run_report', 'sync', 'sync_schedule_task'])).toEqual(['sync']);
  });

  it('keeps only the schedulable base tools, in list order', () => {
    expect(
      pickableToolNames([
        'sync',
        'sync_schedule_task',
        'unschedulable',
        'run_report',
        'run_report_schedule_task',
      ]),
    ).toEqual(['sync', 'run_report']);
  });

  it('returns an empty list when nothing is schedulable', () => {
    expect(pickableToolNames(['run_report', 'sync'])).toEqual([]);
    expect(pickableToolNames([])).toEqual([]);
  });
});
