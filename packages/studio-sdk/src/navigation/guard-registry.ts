/**
 * The armed-navigation-guard registry: the single set every SDK-controlled
 * navigation consults, so feature and plugin-page guards compose against the same
 * guards. `run` stops at the first veto (at most one confirm dialog); `subscribe`
 * lets the provider re-evaluate browser-level listeners when the armed set changes.
 */
import type { NavigationGuardHandler } from './types';

/**
 * One armed navigation guard. The registry holds this exact object (not a
 * snapshot), so flipping `when` or swapping `handler` on re-render takes effect
 * without re-registering.
 */
export interface GuardEntry {
  when: boolean;
  handler: NavigationGuardHandler;
}

export class NavigationGuardRegistry {
  private readonly guards = new Set<GuardEntry>();
  private readonly listeners = new Set<() => void>();

  /** Register a guard; returns the unregister function. */
  add(entry: GuardEntry): () => void {
    this.guards.add(entry);
    this.emit();
    return () => {
      this.guards.delete(entry);
      this.emit();
    };
  }

  /** Notify subscribers that a guard's `when` may have changed. */
  touch(): void {
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  hasArmedGuards(): boolean {
    for (const entry of this.guards) {
      if (entry.when) return true;
    }
    return false;
  }

  /** Resolve `true` only if every armed guard allows the navigation. */
  async run(): Promise<boolean> {
    for (const entry of this.guards) {
      if (!entry.when) continue;
      const allowed = await entry.handler();
      if (!allowed) return false;
    }
    return true;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
