/** Shared constants and the id-basename helper for the storage browser. */
import type { ExplorerEmptyStates } from '@tai42/studio-sdk';
import type { CSSProperties } from 'react';

export const monoStyle: CSSProperties = {
  fontFamily: 'var(--tai-font-mono)',
  wordBreak: 'break-all',
};

/** The explorer's list/card view-mode persistence key. */
export const STORAGE_VIEW_SURFACE = 'studio-storage';

/** The filter box's accessible name; the commit listener keys the search input on it. */
export const SEARCH_LABEL = 'Filter resources';

export const EMPTY_STATES: ExplorerEmptyStates = {
  empty: {
    title: 'No resources',
    description: 'The storage provider holds no objects yet. Upload one to get started.',
  },
  emptyFolder: {
    title: 'This directory is empty',
    description: 'No resources or subdirectories are filed here.',
  },
  noMatch: {
    title: 'No matching resources',
    description: 'No id contains the filter text.',
  },
};

/** The final `/`-separated segment of an id — the download filename and card name. */
export function basename(id: string): string {
  const parts = id.split('/');
  const last = parts[parts.length - 1];
  return last === undefined || last === '' ? id : last;
}
