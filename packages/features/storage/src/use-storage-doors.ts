/**
 * The Storage screen's doors: which API each action goes through, folded from the
 * caller's capability projection and the surfaces the deployment mounts
 * (`storageInfo.surfaces`). The storage doors win where both reach; the templates
 * doors serve a caller holding only the templates grant.
 *
 * Every dynamic storage route (`/api/storage/entries/{id}`, `…/content`, the deletes)
 * is never a concrete route for a non-admin projection, so each is read through the
 * list or upload route that carries the same tag and action. The server stays the
 * authority: a refusal shows as a loud error.
 */
import type { StorageInfo } from '@tai42/api-client';
import { coversWrite, useCapabilities } from '@tai42/studio-sdk';

export type StorageDoor = 'storage' | 'templates';

export interface StorageDoors {
  /** The door the id list loads through. */
  readonly list: StorageDoor | null;
  /** The door one object's detail loads through. */
  readonly entry: StorageDoor | null;
  readonly download: boolean;
  readonly upload: StorageDoor | null;
  readonly deleteDoor: StorageDoor | null;
  readonly render: boolean;
  readonly clearCache: boolean;
  /** Whether the deployment mounts the templates doors. */
  readonly templatesMounted: boolean;
}

export function useStorageDoors(surfaces: StorageInfo['surfaces']): StorageDoors {
  const state = useCapabilities().state;
  const reaches = (path: string, method: string): boolean => coversWrite(state, path, method);
  const storage = surfaces.includes('storage');
  const templates = surfaces.includes('templates');

  const storageRead = storage && reaches('/api/storage/resources', 'GET');
  const storageWrite = storage && reaches('/api/storage/resources', 'POST');

  const pick = (onStorage: boolean, onTemplates: boolean): StorageDoor | null =>
    onStorage ? 'storage' : onTemplates ? 'templates' : null;

  return {
    list: pick(storageRead, templates && reaches('/api/templates', 'GET')),
    entry: pick(storageRead, templates && reaches('/api/template', 'POST')),
    download: storageRead,
    upload: pick(storageWrite, templates && reaches('/api/upload-template', 'POST')),
    deleteDoor: pick(storageWrite, templates && reaches('/api/delete-template', 'POST')),
    render: templates && reaches('/api/render-template', 'POST'),
    clearCache: templates && reaches('/api/clear-templates-cache', 'POST'),
    templatesMounted: templates,
  };
}
