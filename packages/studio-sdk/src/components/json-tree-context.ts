/**
 * The shared tree state a `JsonTree` publishes to its nodes: per-node open state,
 * the reader's toggle, the single copy path, and the page size.
 */
import { createContext, useContext } from 'react';

export interface JsonTreeContextValue {
  /** Whether the node at `path`/`depth` is open right now. */
  readonly isOpen: (path: string, depth: number) => boolean;
  /** Records the reader's explicit toggle of one node. */
  readonly setOpen: (path: string, open: boolean) => void;
  /** Copies a value's JSON, returning whether the write succeeded. */
  readonly copy: (value: unknown) => Promise<boolean>;
  readonly pageSize: number;
}

export const JsonTreeContext = createContext<JsonTreeContextValue | null>(null);

/** The shared tree state; a subcomponent outside a `JsonTree` is a wiring error. */
export function useJsonTreeContext(): JsonTreeContextValue {
  const context = useContext(JsonTreeContext);
  if (context === null) {
    throw new Error('JsonTree subcomponents must be rendered inside a JsonTree.');
  }
  return context;
}
