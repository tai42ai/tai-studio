import type { ApiClient, MemberActionDescriptor } from '@tai42/api-client';
import { ApiProvider, AuthProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ActionDialog } from './ActionDialog';

/**
 * The provider stack ActionDialog expects at runtime: a retry-disabled QueryClient
 * (so an invoke rejection lands as an error on the first attempt), the API context
 * feeding the stub client, the theme context the design system reads, plus the auth
 * and navigation contexts the shared SDK components assume.
 */
function wrapper(client: ApiClient): (props: { children: ReactNode }) => ReactElement {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider value={client}>
          <ThemeProvider>
            <NavigationProvider
              value={{
                navigate: vi.fn(),
                resolvePath: () => '/x',
                navigatePlugin: vi.fn(),
                resolvePluginPath: () => '/x',
              }}
            >
              {children}
            </NavigationProvider>
          </ThemeProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const emptySchema = { type: 'object', properties: {} };

/** Build an opaque descriptor with only what ActionDialog reads. */
function descriptor(overrides: Partial<MemberActionDescriptor>): MemberActionDescriptor {
  return {
    key: 'act-x',
    label: 'Run action',
    scope: 'page',
    destructive: false,
    input_schema: emptySchema,
    result_schema: emptySchema,
    ...overrides,
  } as unknown as MemberActionDescriptor;
}

function renderDialog(
  client: ApiClient,
  props: {
    descriptor: MemberActionDescriptor;
    targetHandle?: string | null;
  },
): { onClose: ReturnType<typeof vi.fn>; onCompleted: ReturnType<typeof vi.fn> } {
  const onClose = vi.fn();
  const onCompleted = vi.fn();
  render(
    <ActionDialog
      descriptor={props.descriptor}
      targetHandle={props.targetHandle ?? null}
      onClose={onClose}
      onCompleted={onCompleted}
    />,
    { wrapper: wrapper(client) },
  );
  return { onClose, onCompleted };
}

describe('ActionDialog input validation', () => {
  const inputSchema = {
    type: 'object',
    properties: { note: { type: 'string', title: 'Note' } },
    required: ['note'],
  };

  it('blocks the invoke and keeps the form open when required input is missing', async () => {
    const invokeMemberAction = vi.fn().mockResolvedValue({ result: {} });
    const client = { invokeMemberAction } as unknown as ApiClient;
    renderDialog(client, {
      descriptor: descriptor({ key: 'act-note', label: 'Set note', input_schema: inputSchema }),
    });

    // The declared input renders through the platform SchemaForm.
    expect(await screen.findByTestId('member-action-act-note')).toBeInTheDocument();
    // Submitting with the required field empty must validate and refuse to invoke.
    await userEvent.click(screen.getByRole('button', { name: 'Set note' }));
    expect(invokeMemberAction).not.toHaveBeenCalled();
    // The form is still shown (no result phase reached).
    expect(screen.getByTestId('member-action-act-note')).toBeInTheDocument();
  });

  it('invokes with the typed input once the required field is filled', async () => {
    const invokeMemberAction = vi.fn().mockResolvedValue({ result: {} });
    const client = { invokeMemberAction } as unknown as ApiClient;
    renderDialog(client, {
      descriptor: descriptor({ key: 'act-note', label: 'Set note', input_schema: inputSchema }),
      targetHandle: 'handle-1',
    });

    const form = await screen.findByTestId('member-action-act-note');
    const control = form.querySelector('input, textarea');
    expect(control).not.toBeNull();
    await userEvent.type(control as HTMLElement, 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Set note' }));

    await waitFor(() => {
      expect(invokeMemberAction).toHaveBeenCalledWith({
        action_key: 'act-note',
        target_handle: 'handle-1',
        input: { note: 'hello' },
      });
    });
  });
});

describe('ActionDialog close gestures', () => {
  it('closes on the Cancel button without invoking', async () => {
    const invokeMemberAction = vi.fn().mockResolvedValue({ result: {} });
    const client = { invokeMemberAction } as unknown as ApiClient;
    const { onClose } = renderDialog(client, { descriptor: descriptor({}) });

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(invokeMemberAction).not.toHaveBeenCalled();
  });

  it('closes on the Escape light-dismiss gesture', async () => {
    const client = {
      invokeMemberAction: vi.fn().mockResolvedValue({ result: {} }),
    } as unknown as ApiClient;
    const { onClose } = renderDialog(client, { descriptor: descriptor({}) });

    await screen.findByRole('button', { name: 'Run action' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});

describe('ActionDialog invoke', () => {
  it('shows a run prompt for a no-input action and surfaces a failed invoke loudly', async () => {
    const invokeMemberAction = vi.fn().mockRejectedValue(new Error('invoke failed'));
    const client = { invokeMemberAction } as unknown as ApiClient;
    renderDialog(client, { descriptor: descriptor({ label: 'Run action' }) });

    // No declared input → a run prompt instead of a form.
    expect(await screen.findByText('Run this action now?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Run action' }));

    expect(await screen.findByText('invoke failed')).toBeInTheDocument();
    // The error phase is not the result phase: the action can still be retried.
    expect(screen.queryByTestId('member-action-result')).toBeNull();
  });

  it('takes a destructive action through a confirm step before invoking', async () => {
    const invokeMemberAction = vi.fn().mockResolvedValue({ result: {} });
    const client = { invokeMemberAction } as unknown as ApiClient;
    renderDialog(client, {
      descriptor: descriptor({ key: 'act-remove', label: 'Remove', destructive: true }),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    // First submit of a destructive action reveals the confirm step, not the invoke.
    expect(await screen.findByTestId('member-action-confirm')).toBeInTheDocument();
    expect(invokeMemberAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(invokeMemberAction).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the schema-driven result and closes through Done', async () => {
    const invokeMemberAction = vi
      .fn()
      .mockResolvedValue({ result: { link: 'https://host/x#t=1' } });
    const client = { invokeMemberAction } as unknown as ApiClient;
    const { onClose, onCompleted } = renderDialog(client, {
      descriptor: descriptor({
        label: 'Invite',
        result_schema: { type: 'object', properties: { link: { type: 'string', title: 'Link' } } },
      }),
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Invite' }));
    expect(await screen.findByTestId('member-action-result-link')).toBeInTheDocument();
    await waitFor(() => {
      expect(onCompleted).toHaveBeenCalledTimes(1);
    });
    // The result phase is undismissable: only Done closes it.
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
