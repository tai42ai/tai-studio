/**
 * Direct behaviour tests for the upload form: a valid submit posts the exact
 * (path, content) pair to `api.uploadTemplate` and resets the fields on success;
 * the submit button is guarded while the path is blank and while the mutation is
 * in flight; a rejected upload surfaces loudly in an `ErrorState` and leaves the
 * typed values intact so the user can retry.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { deferred } from '@tai42/studio-sdk/testing';

import { UploadTemplateForm } from './UploadTemplateForm';
import { renderWithProviders, type StubApiClient } from './test-utils';

describe('UploadTemplateForm', () => {
  it('posts the exact path and content and resets the fields on success', async () => {
    const user = userEvent.setup();
    const uploadTemplate = vi.fn().mockResolvedValue({ path: 'prompts/new.md', uploaded: true });
    const client: StubApiClient = { uploadTemplate };
    renderWithProviders(<UploadTemplateForm />, { client });

    const path = screen.getByLabelText('Path');
    const content = screen.getByLabelText('Content');
    await user.type(path, 'prompts/new.md');
    await user.type(content, 'Body text');
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(uploadTemplate).toHaveBeenCalledWith('prompts/new.md', 'Body text');
    });
    expect(uploadTemplate).toHaveBeenCalledTimes(1);
    // onSuccess clears both controlled inputs.
    await waitFor(() => {
      expect(path).toHaveValue('');
    });
    expect(content).toHaveValue('');
  });

  it('submits with empty content when only a path is given', async () => {
    const user = userEvent.setup();
    const uploadTemplate = vi.fn().mockResolvedValue({ path: 'prompts/only.md', uploaded: true });
    const client: StubApiClient = { uploadTemplate };
    renderWithProviders(<UploadTemplateForm />, { client });

    await user.type(screen.getByLabelText('Path'), 'prompts/only.md');
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(uploadTemplate).toHaveBeenCalledWith('prompts/only.md', '');
    });
  });

  it('keeps submit disabled until the path has non-whitespace content', async () => {
    const user = userEvent.setup();
    const uploadTemplate = vi.fn();
    const client: StubApiClient = { uploadTemplate };
    renderWithProviders(<UploadTemplateForm />, { client });

    const submit = screen.getByRole('button', { name: 'Upload' });
    expect(submit).toBeDisabled();

    // Whitespace-only is still not a valid path.
    await user.type(screen.getByLabelText('Path'), '   ');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Path'), 'p.md');
    expect(submit).toBeEnabled();
  });

  it('disables submit and shows the spinner while the upload is in flight', async () => {
    const user = userEvent.setup();
    const pending = deferred<{ path: string; uploaded: true }>();
    const uploadTemplate = vi.fn().mockReturnValue(pending.promise);
    const client: StubApiClient = { uploadTemplate };
    renderWithProviders(<UploadTemplateForm />, { client });

    await user.type(screen.getByLabelText('Path'), 'prompts/slow.md');
    const submit = screen.getByRole('button', { name: 'Upload' });
    await user.click(submit);

    await waitFor(() => {
      expect(submit).toBeDisabled();
    });
    expect(screen.getByRole('status', { name: 'Uploading' })).toBeInTheDocument();

    pending.resolve({ path: 'prompts/slow.md', uploaded: true });
    await waitFor(() => {
      expect(screen.queryByRole('status', { name: 'Uploading' })).not.toBeInTheDocument();
    });
  });

  it('surfaces a failed upload loudly and preserves the typed values', async () => {
    const user = userEvent.setup();
    const uploadTemplate = vi.fn().mockRejectedValue(new Error('upload failed: quota exceeded'));
    const client: StubApiClient = { uploadTemplate };
    renderWithProviders(<UploadTemplateForm />, { client });

    const path = screen.getByLabelText('Path');
    const content = screen.getByLabelText('Content');
    await user.type(path, 'prompts/bad.md');
    await user.type(content, 'Body');
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('upload failed: quota exceeded');
    // A failure must not clear the form — the user can fix and retry.
    expect(path).toHaveValue('prompts/bad.md');
    expect(content).toHaveValue('Body');
  });
});

describe('UploadTemplateForm — files mode', () => {
  it('loops the single-item door once per picked file, deriving the path from the name', async () => {
    const user = userEvent.setup();
    const uploadTemplate = vi.fn().mockResolvedValue({ uploaded: true });
    const listTemplates = vi.fn().mockResolvedValue([]);
    const client: StubApiClient = { uploadTemplate, listTemplates };
    renderWithProviders(<UploadTemplateForm />, { client });

    await user.click(screen.getByRole('radio', { name: 'Files' }));
    await user.upload(screen.getByLabelText('Choose files'), [
      new File(['one'], 'a.md', { type: 'text/markdown' }),
      new File(['two'], 'b.md', { type: 'text/markdown' }),
    ]);
    // Submit unlocks once the existing-list query settles (no conflict).
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(uploadTemplate).toHaveBeenCalledTimes(2);
    });
    expect(uploadTemplate).toHaveBeenCalledWith('a.md', 'one');
    expect(uploadTemplate).toHaveBeenCalledWith('b.md', 'two');
  });

  it('blocks the whole batch BEFORE any request when a path already exists', async () => {
    const user = userEvent.setup();
    const uploadTemplate = vi.fn();
    const listTemplates = vi.fn().mockResolvedValue(['a.md']);
    const client: StubApiClient = { uploadTemplate, listTemplates };
    renderWithProviders(<UploadTemplateForm />, { client });

    await user.click(screen.getByRole('radio', { name: 'Files' }));
    await user.upload(
      screen.getByLabelText('Choose files'),
      new File(['x'], 'a.md', { type: 'text/markdown' }),
    );

    // The list query resolves to `['a.md']`, so the derived path collides: the batch
    // is blocked, Upload stays disabled, and no request is sent.
    expect(await screen.findByText(/already exist/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(uploadTemplate).not.toHaveBeenCalled();
  });

  it('does not silently proceed when the templates list errored — it blocks the batch loudly', async () => {
    const user = userEvent.setup();
    const uploadTemplate = vi.fn();
    const listTemplates = vi.fn().mockRejectedValue(new Error('list unavailable'));
    const client: StubApiClient = { uploadTemplate, listTemplates };
    renderWithProviders(<UploadTemplateForm />, { client });

    await user.click(screen.getByRole('radio', { name: 'Files' }));
    await user.upload(
      screen.getByLabelText('Choose files'),
      new File(['x'], 'a.md', { type: 'text/markdown' }),
    );

    // Existing names are unknown, so the conflict guard cannot run: Upload stays
    // disabled and the unavailability is surfaced — never a vacuous "no conflicts" pass.
    expect(await screen.findByText(/Could not load existing templates/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(uploadTemplate).not.toHaveBeenCalled();
  });

  it('keeps failed files listed on a PARTIAL failure and reports each outcome', async () => {
    const user = userEvent.setup();
    const uploadTemplate = vi
      .fn()
      .mockResolvedValueOnce({ uploaded: true })
      .mockRejectedValueOnce(new Error('quota exceeded'));
    const listTemplates = vi.fn().mockResolvedValue([]);
    const client: StubApiClient = { uploadTemplate, listTemplates };
    renderWithProviders(<UploadTemplateForm />, { client });

    await user.click(screen.getByRole('radio', { name: 'Files' }));
    await user.upload(screen.getByLabelText('Choose files'), [
      new File(['one'], 'a.md', { type: 'text/markdown' }),
      new File(['two'], 'b.md', { type: 'text/markdown' }),
    ]);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    // Per-file outcomes: one Uploaded, one Failed, with the server message verbatim.
    expect(await screen.findByText('quota exceeded')).toBeInTheDocument();
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});
