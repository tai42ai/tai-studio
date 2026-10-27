/**
 * Who may write the tool-organization overlay, and what a refused overlay write shows.
 *
 * Each write is gated on the exact `method path` it calls — filing or editing a tool
 * (`PATCH /api/tool-meta/tools/{tool_name}`), and creating, renaming, moving or
 * deleting a folder (each its own folder route) — so a caller whose projection reaches
 * one of them is offered that one alone. Every write also closes once the tool_meta
 * store is known OFF: from the kind-status table before any write, or from a write's
 * 501 `tool-meta-not-configured` refusal, which {@link useReportToolMetaRefusal}
 * records for every screen at once.
 */
import type { apiRoutes } from '@tai42/api-client';
import { type ReactNode, useCallback } from 'react';

import { errorMessage } from '../errors';
import { FeatureDisabled, featureDisabledMessage, isFeatureDisabled } from '../feature-disabled';
import { useCanWrite } from '../hooks/useCapabilities';
import { useFeatureOff, useReportFeatureOff } from '../hooks/useSystemKinds';
import { ErrorState } from './primitives';

/** The kind-status kind of the tool-organization overlay store. */
const TOOL_META_KIND = 'tool_meta';

type ApiRoutes = typeof apiRoutes;

// The overlay write routes. Spelled here because the SDK takes no runtime import of
// the API client; the `satisfies` pin fails to compile if a route's method or path
// drifts from the generated route table.
const TOOL_META_WRITE_ROUTES = {
  editTool: { method: 'PATCH', path: '/api/tool-meta/tools/{tool_name}' },
  createFolder: { method: 'POST', path: '/api/tool-meta/folders' },
  renameFolder: { method: 'POST', path: '/api/tool-meta/folders/{folder_id}/rename' },
  moveFolder: { method: 'POST', path: '/api/tool-meta/folders/{folder_id}/move' },
  deleteFolder: { method: 'DELETE', path: '/api/tool-meta/folders/{folder_id}' },
} as const satisfies {
  readonly editTool: ApiRoutes['patch_api_tool_meta_tools_tool_name'];
  readonly createFolder: ApiRoutes['post_api_tool_meta_folders'];
  readonly renameFolder: ApiRoutes['post_api_tool_meta_folders_folder_id_rename'];
  readonly moveFolder: ApiRoutes['post_api_tool_meta_folders_folder_id_move'];
  readonly deleteFolder: ApiRoutes['delete_api_tool_meta_folders_folder_id'];
};

/** Which overlay writes the caller may be offered. */
export interface ToolMetaWriteAccess {
  /** Edit a tool's overlay row — its display name, tags, visibility or folder. */
  readonly editTool: boolean;
  readonly createFolder: boolean;
  readonly renameFolder: boolean;
  readonly moveFolder: boolean;
  readonly deleteFolder: boolean;
}

function useRouteOpen(route: { readonly method: string; readonly path: string }): boolean {
  return useCanWrite(route.path, route.method);
}

/**
 * The overlay writes the caller may be offered: each one's own route reached by the
 * projection (fail closed until the projection is ready) and the tool_meta store not
 * known OFF.
 */
export function useToolMetaWriteAccess(): ToolMetaWriteAccess {
  const off = useFeatureOff(TOOL_META_KIND);
  const editTool = useRouteOpen(TOOL_META_WRITE_ROUTES.editTool);
  const createFolder = useRouteOpen(TOOL_META_WRITE_ROUTES.createFolder);
  const renameFolder = useRouteOpen(TOOL_META_WRITE_ROUTES.renameFolder);
  const moveFolder = useRouteOpen(TOOL_META_WRITE_ROUTES.moveFolder);
  const deleteFolder = useRouteOpen(TOOL_META_WRITE_ROUTES.deleteFolder);
  return {
    editTool: editTool && !off,
    createFolder: createFolder && !off,
    renameFolder: renameFolder && !off,
    moveFolder: moveFolder && !off,
    deleteFolder: deleteFolder && !off,
  };
}

/**
 * Hand a failed overlay write here: a not-configured refusal (501
 * `tool-meta-not-configured`) is recorded so every screen withdraws its overlay
 * writes; any other failure is left to the caller, which shows it.
 */
export function useReportToolMetaRefusal(): (error: unknown) => void {
  const reportOff = useReportFeatureOff();
  return useCallback(
    (error: unknown) => {
      if (isFeatureDisabled(error)) reportOff(TOOL_META_KIND, featureDisabledMessage(error));
    },
    [reportOff],
  );
}

/** A failed overlay write as its dialog shows it: the muted OFF note with the server's
 *  message for a not-configured refusal, an error for anything else. */
export function ToolMetaWriteError({ error }: { readonly error: unknown }): ReactNode {
  if (error === null || error === undefined) return null;
  if (isFeatureDisabled(error)) {
    return <FeatureDisabled feature="Tool metadata" message={featureDisabledMessage(error)} />;
  }
  return <ErrorState message={errorMessage(error)} />;
}
