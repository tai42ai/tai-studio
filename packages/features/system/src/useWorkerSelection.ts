/**
 * The worker-fleet selection state. Derives the reload payload and count only from
 * workers still served, so a selection left over from a since-refreshed fleet never
 * reloads a worker that has left. Reload targets are worker NAMES.
 */
import { useState } from 'react';
import type { FleetWorker } from '@tai42/api-client';

export interface WorkerSelection {
  readonly selected: ReadonlySet<string>;
  readonly allSelected: boolean;
  /** The reload targets: worker names, or `null` for "all" when none are selected. */
  readonly targets: string[] | null;
  readonly reloadLabel: string;
  readonly toggle: (name: string, next: boolean) => void;
  readonly toggleAll: (next: boolean) => void;
}

export function useWorkerSelection(rows: readonly FleetWorker[]): WorkerSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const selectedWorkers = rows.filter((worker) => selected.has(worker.name));
  const allSelected = rows.length > 0 && selectedWorkers.length === rows.length;
  const targets: string[] | null =
    selectedWorkers.length === 0 ? null : selectedWorkers.map((worker) => worker.name);
  const reloadLabel =
    selectedWorkers.length === 0
      ? 'Reload config (all)'
      : `Reload config (${String(selectedWorkers.length)} selected)`;

  const toggle = (name: string, next: boolean): void => {
    setSelected((current) => {
      const updated = new Set(current);
      if (next) updated.add(name);
      else updated.delete(name);
      return updated;
    });
  };

  const toggleAll = (next: boolean): void => {
    setSelected(next ? new Set(rows.map((worker) => worker.name)) : new Set());
  };

  return { selected, allSelected, targets, reloadLabel, toggle, toggleAll };
}
