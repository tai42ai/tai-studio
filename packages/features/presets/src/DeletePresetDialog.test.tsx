/**
 * The delete-preset confirm on its own: the consequence copy for a live preset, a
 * quarantined record and a stored row no read could classify, a refused delete
 * whose body names holders — its first line above the list, Delete held disabled —
 * and the shared tool overlay refreshed after a delete.
 */
import { ApiError } from '@tai42/api-client';
import { toolMetaKey } from '@tai42/studio-sdk';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DeletePresetDialog } from './DeletePresetDialog';
import { clickWhenInteractable, fullProjection, renderWithProviders } from './test-utils';

const noHolders = (): Promise<{ action: 'delete'; holders: [] }> =>
  Promise.resolve({ action: 'delete', holders: [] });

describe('DeletePresetDialog', () => {
  it.each([
    [false, 'Soft-deletes the preset and tears down its tool (and its branch tools).'],
    [true, 'Removes the quarantined record. No live tool is touched.'],
    [
      null,
      "Deletes the stored preset; a registered preset's tool (and its branch tools) is torn down with it, a quarantined record is removed alone.",
    ],
  ])('names the consequence when conflicted is %s', async (conflicted, consequence) => {
    renderWithProviders(
      <DeletePresetDialog
        name="paris_weather"
        conflicted={conflicted}
        onClose={vi.fn()}
        onDeleted={vi.fn()}
      />,
      { client: { getPresetReferees: vi.fn(noHolders) }, projection: fullProjection() },
    );
    const dialog = await screen.findByRole('dialog', { name: 'Delete preset — paris_weather' });
    expect(within(dialog).getByText(consequence)).toBeInTheDocument();
  });

  it('a refusal naming holders shows its first line and lists them, Delete disabled', async () => {
    const user = userEvent.setup({ delay: null });
    const message = "preset 'paris_weather' cannot be deleted — held by:\n  hook 'h1'";
    const deletePreset = vi.fn().mockRejectedValue(
      new ApiError(message, 409, undefined, undefined, {
        error: message,
        holders: [{ kind: 'hook', tag: 'hooks', name: 'h1', locator: {}, summary: "hook 'h1'" }],
      }),
    );
    const onDeleted = vi.fn();
    renderWithProviders(
      <DeletePresetDialog
        name="paris_weather"
        conflicted={false}
        onClose={vi.fn()}
        onDeleted={onDeleted}
      />,
      {
        client: { getPresetReferees: vi.fn(noHolders), deletePreset },
        projection: fullProjection(),
      },
    );

    await clickWhenInteractable(user, await screen.findByRole('button', { name: 'Delete' }));

    expect(
      await screen.findByText("preset 'paris_weather' cannot be deleted — held by:"),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "hook 'h1'" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('refreshes the shared tool overlay after a delete, so every screen drops the rows', async () => {
    const user = userEvent.setup({ delay: null });
    const deletePreset = vi.fn().mockResolvedValue({ name: 'paris_weather', deleted: true });
    const onDeleted = vi.fn();
    const { queryClient } = renderWithProviders(
      <DeletePresetDialog
        name="paris_weather"
        conflicted={false}
        onClose={vi.fn()}
        onDeleted={onDeleted}
      />,
      {
        client: { getPresetReferees: vi.fn(noHolders), deletePreset },
        projection: fullProjection(),
      },
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await clickWhenInteractable(user, await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });
    expect(deletePreset).toHaveBeenCalledWith('paris_weather');
    // A delete clears the removed tools' overlay rows (folder, tags, display name).
    expect(invalidate).toHaveBeenCalledWith({ queryKey: toolMetaKey });
  });
});
