/**
 * Who may write the tool-organization overlay: each write is gated on the route and
 * method it actually calls, and the whole set closes once the tool_meta store is
 * known to be off — from the kind-status table, or from a write's 501 refusal seen
 * anywhere in the app.
 */
import type { KindStatus } from '@tai42/api-client';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FULL_PROJECTION, projectionReaching, writeSession } from '../hooks/test-write-session';
import { useCapabilities } from '../hooks/useCapabilities';
import { useFeatureOffMessage, useSystemKinds } from '../hooks/useSystemKinds';
import {
  ToolMetaWriteError,
  useReportToolMetaRefusal,
  useToolMetaWriteAccess,
} from './tool-meta-access';

const CREATE = { method: 'POST', path: '/api/tool-meta/folders' };
const RENAME = { method: 'POST', path: '/api/tool-meta/folders/{folder_id}/rename' };
const MOVE = { method: 'POST', path: '/api/tool-meta/folders/{folder_id}/move' };
const DELETE = { method: 'DELETE', path: '/api/tool-meta/folders/{folder_id}' };
const EDIT = { method: 'PATCH', path: '/api/tool-meta/tools/{tool_name}' };

const NOTHING = {
  editTool: false,
  createFolder: false,
  renameFolder: false,
  moveFolder: false,
  deleteFolder: false,
};

const REFUSAL = {
  status: 501,
  code: 'tool-meta-not-configured',
  message: 'Tool metadata needs a tool_meta store.',
};

afterEach(() => {
  globalThis.sessionStorage.clear();
});

describe('useToolMetaWriteAccess', () => {
  it('grants each write only on its own route and method', async () => {
    for (const [route, key] of [
      [CREATE, 'createFolder'],
      [RENAME, 'renameFolder'],
      [MOVE, 'moveFolder'],
      [DELETE, 'deleteFolder'],
      [EDIT, 'editTool'],
    ] as const) {
      const { result, unmount } = renderHook(() => useToolMetaWriteAccess(), {
        wrapper: writeSession({}, { projection: projectionReaching(route) }),
      });
      await waitFor(() => {
        expect(result.current).toEqual({ ...NOTHING, [key]: true });
      });
      unmount();
    }
  });

  it('grants every write to a full projection', async () => {
    const { result } = renderHook(() => useToolMetaWriteAccess(), {
      wrapper: writeSession({}, { projection: FULL_PROJECTION }),
    });
    await waitFor(() => {
      expect(Object.values(result.current).every(Boolean)).toBe(true);
    });
  });

  it('grants nothing once the kind-status table reports the store off', async () => {
    const off: KindStatus = { kind: 'tool_meta', state: 'off', plugin: null, detail: 'off' };
    const { result } = renderHook(
      () => ({
        access: useToolMetaWriteAccess(),
        projection: useCapabilities().state.status,
        table: useSystemKinds().status,
      }),
      { wrapper: writeSession({}, { kinds: [off] }) },
    );
    await waitFor(() => {
      expect([result.current.projection, result.current.table]).toEqual(['ready', 'ready']);
    });
    expect(result.current.access).toEqual(NOTHING);
  });

  it('grants nothing after any overlay write is refused as not configured', async () => {
    const { result } = renderHook(
      () => ({
        access: useToolMetaWriteAccess(),
        report: useReportToolMetaRefusal(),
        message: useFeatureOffMessage('tool_meta'),
      }),
      { wrapper: writeSession({}) },
    );
    await waitFor(() => {
      expect(result.current.access.editTool).toBe(true);
    });
    act(() => {
      result.current.report(REFUSAL);
    });
    expect(result.current.access).toEqual(NOTHING);
    expect(result.current.message).toBe(REFUSAL.message);
  });

  it('leaves the access open after a refusal that is not a not-configured one', async () => {
    const { result } = renderHook(
      () => ({ access: useToolMetaWriteAccess(), report: useReportToolMetaRefusal() }),
      { wrapper: writeSession({}) },
    );
    await waitFor(() => {
      expect(result.current.access.editTool).toBe(true);
    });
    act(() => {
      result.current.report({ status: 409, message: 'Folder not empty' });
    });
    expect(result.current.access.editTool).toBe(true);
  });
});

describe('ToolMetaWriteError', () => {
  it('shows a not-configured refusal as the muted off note with the server message', () => {
    render(<ToolMetaWriteError error={REFUSAL} />);
    expect(screen.getByTestId('feature-disabled')).toHaveTextContent(
      'Tool metadata is not configured',
    );
    expect(screen.getByText(REFUSAL.message)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows any other failure as an error', () => {
    render(<ToolMetaWriteError error={new Error('Folder not empty')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Folder not empty');
  });

  it('renders nothing without an error', () => {
    const { container } = render(<ToolMetaWriteError error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
