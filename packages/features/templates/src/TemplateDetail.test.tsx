/**
 * Direct behaviour tests for the template detail card: it fetches one template
 * with `api.getTemplate`, shows a skeleton while pending, surfaces a failed fetch
 * loudly, and renders the content in an escaped code block. The delete action is
 * guarded by a confirm dialog — confirming deletes by exact id and navigates back
 * to the un-selected view, a failed delete stays loud inside the open dialog, and
 * cancelling never touches the api. It also hosts the render preview end to end.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TemplateDetail } from './TemplateDetail';
import { renderWithProviders, type StubApiClient } from './test-utils';

describe('TemplateDetail — fetch states', () => {
  it('renders the id heading and the escaped content on success', async () => {
    const getTemplate = vi.fn().mockResolvedValue({ template: 'Hello {{ name }}', schema: {} });
    const client: StubApiClient = { getTemplate };
    renderWithProviders(<TemplateDetail templateId="prompts/a.md" />, { client });

    expect(screen.getByRole('heading', { level: 2, name: 'prompts/a.md' })).toBeInTheDocument();
    expect(await screen.findByText('Hello {{ name }}')).toBeInTheDocument();
    expect(getTemplate).toHaveBeenCalledWith('prompts/a.md');
  });

  it('shows a pending state before the fetch resolves', async () => {
    // A never-settling fetch keeps the query pending.
    const getTemplate = vi.fn().mockReturnValue(new Promise(() => undefined));
    const client: StubApiClient = { getTemplate };
    renderWithProviders(<TemplateDetail templateId="prompts/a.md" />, { client });

    // The header (id + delete trigger) is always present; the content section is
    // not rendered until the fetch resolves.
    expect(screen.getByRole('heading', { level: 2, name: 'prompts/a.md' })).toBeInTheDocument();
    expect(screen.queryByText('Content')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Render' })).not.toBeInTheDocument();
  });

  it('surfaces a failed fetch loudly', async () => {
    const getTemplate = vi.fn().mockRejectedValue(new Error('template not found'));
    const client: StubApiClient = { getTemplate };
    renderWithProviders(<TemplateDetail templateId="prompts/a.md" />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('template not found');
  });
});

describe('TemplateDetail — delete', () => {
  it('deletes by exact id behind the confirm dialog and navigates back', async () => {
    const user = userEvent.setup();
    const deleteTemplate = vi.fn().mockResolvedValue({ path: 'prompts/a.md', deleted: true });
    const client: StubApiClient = {
      getTemplate: vi.fn().mockResolvedValue({ template: 'body', schema: {} }),
      deleteTemplate,
    };
    const { navigate } = renderWithProviders(<TemplateDetail templateId="prompts/a.md" />, {
      client,
    });

    await screen.findByText('body');
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(deleteTemplate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete template' }));

    await waitFor(() => {
      expect(deleteTemplate).toHaveBeenCalledWith('prompts/a.md');
    });
    expect(navigate).toHaveBeenCalledWith('templates');
  });

  it('keeps a failed delete loud inside the dialog and does not navigate', async () => {
    const user = userEvent.setup();
    const deleteTemplate = vi.fn().mockRejectedValue(new Error('delete denied'));
    const client: StubApiClient = {
      getTemplate: vi.fn().mockResolvedValue({ template: 'body', schema: {} }),
      deleteTemplate,
    };
    const { navigate } = renderWithProviders(<TemplateDetail templateId="prompts/a.md" />, {
      client,
    });

    await screen.findByText('body');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete template' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('delete denied');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not delete when the dialog is cancelled', async () => {
    const user = userEvent.setup();
    const deleteTemplate = vi.fn();
    const client: StubApiClient = {
      getTemplate: vi.fn().mockResolvedValue({ template: 'body', schema: {} }),
      deleteTemplate,
    };
    renderWithProviders(<TemplateDetail templateId="prompts/a.md" />, { client });

    await screen.findByText('body');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(deleteTemplate).not.toHaveBeenCalled();
  });
});

describe('TemplateDetail — hosted render preview', () => {
  it('drives the render preview with the detail template id', async () => {
    const user = userEvent.setup();
    const renderTemplate = vi.fn().mockResolvedValue({ rendered: 'rendered body' });
    const client: StubApiClient = {
      getTemplate: vi.fn().mockResolvedValue({ template: 'body', schema: {} }),
      renderTemplate,
    };
    renderWithProviders(<TemplateDetail templateId="prompts/a.md" />, { client });

    await screen.findByText('body');
    await user.click(screen.getByRole('button', { name: 'Render' }));

    await waitFor(() => {
      expect(renderTemplate).toHaveBeenCalledWith({
        template_id: 'prompts/a.md',
        kwargs: {},
      });
    });
    expect(await screen.findByText('rendered body')).toBeInTheDocument();
  });
});
