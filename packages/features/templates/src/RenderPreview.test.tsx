/**
 * Direct behaviour tests for the render-preview form: kwargs JSON is parsed to a
 * plain object BEFORE any request, so an empty box renders with `{}`, malformed
 * JSON and non-object JSON are LOUD inline field errors that never reach the
 * network, and a valid object posts the exact `{ template_id, kwargs }` body.
 * Rendered output is shown as ESCAPED text — a `<script>` payload is displayed
 * verbatim, never injected — and a rejected render surfaces in an `ErrorState`.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RenderPreview } from './RenderPreview';
import { renderWithProviders, type StubApiClient } from './test-utils';

describe('RenderPreview', () => {
  it('posts the exact template id and parsed kwargs and shows the output', async () => {
    const user = userEvent.setup();
    const renderTemplate = vi.fn().mockResolvedValue({ rendered: 'Hello Ada' });
    const client: StubApiClient = { renderTemplate };
    renderWithProviders(<RenderPreview templateId="prompts/a.md" />, { client });

    const kwargs = screen.getByLabelText('Keyword arguments (JSON)');
    await user.clear(kwargs);
    await user.type(kwargs, '{{"name": "Ada"}');
    await user.click(screen.getByRole('button', { name: 'Render' }));

    await waitFor(() => {
      expect(renderTemplate).toHaveBeenCalledWith({
        template_id: 'prompts/a.md',
        kwargs: { name: 'Ada' },
      });
    });
    expect(await screen.findByText('Hello Ada')).toBeInTheDocument();
  });

  it('treats an empty kwargs box as an empty object', async () => {
    const user = userEvent.setup();
    const renderTemplate = vi.fn().mockResolvedValue({ rendered: 'done' });
    const client: StubApiClient = { renderTemplate };
    renderWithProviders(<RenderPreview templateId="prompts/a.md" />, { client });

    await user.clear(screen.getByLabelText('Keyword arguments (JSON)'));
    await user.click(screen.getByRole('button', { name: 'Render' }));

    await waitFor(() => {
      expect(renderTemplate).toHaveBeenCalledWith({
        template_id: 'prompts/a.md',
        kwargs: {},
      });
    });
  });

  it('shows a loud field error on malformed JSON and never calls the api', async () => {
    const user = userEvent.setup();
    const renderTemplate = vi.fn();
    const client: StubApiClient = { renderTemplate };
    renderWithProviders(<RenderPreview templateId="prompts/a.md" />, { client });

    const kwargs = screen.getByLabelText('Keyword arguments (JSON)');
    await user.clear(kwargs);
    await user.type(kwargs, 'not json');
    await user.click(screen.getByRole('button', { name: 'Render' }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(renderTemplate).not.toHaveBeenCalled();
  });

  it('rejects non-object JSON as a field error and never calls the api', async () => {
    const user = userEvent.setup();
    const renderTemplate = vi.fn();
    const client: StubApiClient = { renderTemplate };
    renderWithProviders(<RenderPreview templateId="prompts/a.md" />, { client });

    const kwargs = screen.getByLabelText('Keyword arguments (JSON)');
    await user.clear(kwargs);
    // Valid JSON, but a scalar — kwargs must be an object.
    await user.type(kwargs, '42');
    await user.click(screen.getByRole('button', { name: 'Render' }));

    expect(await screen.findByText(/kwargs must be a JSON object/)).toBeInTheDocument();
    expect(renderTemplate).not.toHaveBeenCalled();
  });

  it('clears the field error once a valid submit succeeds', async () => {
    const user = userEvent.setup();
    const renderTemplate = vi.fn().mockResolvedValue({ rendered: 'ok' });
    const client: StubApiClient = { renderTemplate };
    renderWithProviders(<RenderPreview templateId="prompts/a.md" />, { client });

    const kwargs = screen.getByLabelText('Keyword arguments (JSON)');
    await user.clear(kwargs);
    await user.type(kwargs, 'bad');
    await user.click(screen.getByRole('button', { name: 'Render' }));
    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();

    await user.clear(kwargs);
    await user.type(kwargs, '{{}');
    await user.click(screen.getByRole('button', { name: 'Render' }));

    await waitFor(() => {
      expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
    });
    expect(renderTemplate).toHaveBeenCalledWith({ template_id: 'prompts/a.md', kwargs: {} });
  });

  it('surfaces a rejected render loudly', async () => {
    const user = userEvent.setup();
    const renderTemplate = vi.fn().mockRejectedValue(new Error('render blew up'));
    const client: StubApiClient = { renderTemplate };
    renderWithProviders(<RenderPreview templateId="prompts/a.md" />, { client });

    await user.click(screen.getByRole('button', { name: 'Render' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('render blew up');
  });

  it('renders script-bearing output as escaped text (XSS pin)', async () => {
    const user = userEvent.setup();
    const payload = '<script>alert(1)</script>';
    const renderTemplate = vi.fn().mockResolvedValue({ rendered: payload });
    const client: StubApiClient = { renderTemplate };
    const { container } = renderWithProviders(<RenderPreview templateId="prompts/a.md" />, {
      client,
    });

    await user.click(screen.getByRole('button', { name: 'Render' }));

    expect(await screen.findByText(payload)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
});
