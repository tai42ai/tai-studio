/**
 * The picker's schedulable-tool derivation: a tool is offered exactly when the server
 * serves it as `schedulable` (its schedule vehicle is registered). Driven on the pure
 * `pickableToolNames` so the rule is pinned apart from the dialog wiring.
 */
import type { ToolTagEntry } from '@tai42/api-client';
import { describe, expect, it } from 'vitest';

import { pickableToolNames } from './use-schedule-tools';

function row(name: string, schedulable: boolean): ToolTagEntry {
  return { name, description: null, schedulable, tags: [], hidden: false, badges: [] };
}

describe('pickableToolNames', () => {
  it('lists a tool the server serves as schedulable', () => {
    expect(pickableToolNames([row('run_report', true)])).toEqual(['run_report']);
  });

  it('drops a tool that is not schedulable, whatever its name', () => {
    expect(
      pickableToolNames([
        row('run_report', false),
        row('run_report_schedule_task', false),
        row('sync', true),
      ]),
    ).toEqual(['sync']);
  });

  it('keeps the schedulable tools in list order', () => {
    expect(
      pickableToolNames([row('sync', true), row('unschedulable', false), row('run_report', true)]),
    ).toEqual(['sync', 'run_report']);
  });

  it('returns an empty list when nothing is schedulable', () => {
    expect(pickableToolNames([row('run_report', false)])).toEqual([]);
    expect(pickableToolNames([])).toEqual([]);
  });
});
