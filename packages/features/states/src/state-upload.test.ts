/**
 * Focused tests for the states upload hook: kind/name resolution off the parsed
 * document, the state vs state-template PUT shapes, and the 409 handling — only a
 * state-template clash opens the Replace confirm; a state's 409 surfaces loudly.
 */
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import { ApiProvider } from '@tai42/studio-sdk';
import { ApiError, type ApiClient } from '@tai42/api-client';

import { useStateUpload } from './state-upload';

function wrapper(client: Partial<ApiClient>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }): ReactNode =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ApiProvider, { value: client as ApiClient }, children),
    );
}

/** A `.json` file whose text is the given document. */
function jsonFile(doc: unknown): File {
  return new File([JSON.stringify(doc)], 'upload.json', { type: 'application/json' });
}

/** A synthetic file-input change carrying `file`. */
function fileEvent(file: File): { target: { files: File[]; value: string } } {
  return { target: { files: [file], value: '' } };
}

function setup(client: Partial<ApiClient>) {
  const onRefetch = vi.fn().mockResolvedValue(undefined);
  const view = renderHook(() => useStateUpload({ onRefetch }), { wrapper: wrapper(client) });
  return { view, onRefetch };
}

describe('useStateUpload — kind resolution', () => {
  it('PUTs a state document by its declaration shape and refetches', async () => {
    const putState = vi.fn().mockResolvedValue({ name: 'profile' });
    const { view, onRefetch } = setup({ putState });
    await act(async () => {
      await view.result.current.onFile(
        fileEvent(jsonFile({ kind: 'state', name: 'profile', description: 'd' })) as never,
      );
    });
    expect(putState).toHaveBeenCalledWith('profile', expect.objectContaining({ name: 'profile' }));
    expect(onRefetch).toHaveBeenCalled();
    expect(view.result.current.uploadError).toBeNull();
  });

  it('PUTs a state-template document with the replace flag off', async () => {
    const putStateTemplate = vi.fn().mockResolvedValue({ name: 't' });
    const { view } = setup({ putStateTemplate });
    await act(async () => {
      await view.result.current.onFile(
        fileEvent(jsonFile({ kind: 'state-template', name: 't' })) as never,
      );
    });
    expect(putStateTemplate).toHaveBeenCalledWith('t', expect.anything(), false);
  });

  it('reports a loud error when the document has no name', async () => {
    const { view } = setup({});
    await act(async () => {
      await view.result.current.onFile(fileEvent(jsonFile({ kind: 'state' })) as never);
    });
    expect(view.result.current.uploadError).toMatch(/no `name`/);
  });

  it('reports a loud error when the document has no recognised kind', async () => {
    const { view } = setup({});
    await act(async () => {
      await view.result.current.onFile(fileEvent(jsonFile({ name: 'x' })) as never);
    });
    expect(view.result.current.uploadError).toMatch(/no `kind`/);
  });
});

describe('useStateUpload — 409 handling', () => {
  it('opens a Replace confirm on a state-template 409', async () => {
    const putStateTemplate = vi.fn().mockRejectedValue(new ApiError('exists', 409));
    const { view } = setup({ putStateTemplate });
    await act(async () => {
      await view.result.current.onFile(
        fileEvent(jsonFile({ kind: 'state-template', name: 't' })) as never,
      );
    });
    expect(view.result.current.pendingReplace).toEqual(
      expect.objectContaining({ name: 't', document: 'state-template' }),
    );
    expect(view.result.current.uploadError).toBeNull();
  });

  it('surfaces a state 409 loudly (no replace flag for a declaration)', async () => {
    const putState = vi.fn().mockRejectedValue(new ApiError('narrowing over records', 409));
    const { view } = setup({ putState });
    await act(async () => {
      await view.result.current.onFile(fileEvent(jsonFile({ kind: 'state', name: 'p' })) as never);
    });
    expect(view.result.current.pendingReplace).toBeNull();
    await waitFor(() => {
      expect(view.result.current.uploadError).toMatch(/narrowing over records/);
    });
  });
});
