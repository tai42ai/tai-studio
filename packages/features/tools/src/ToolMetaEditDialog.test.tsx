/**
 * The per-tool tool_meta edit dialog: the three-way visibility control's tri-state
 * mapping (Default / Shown / Hidden ⇄ null / false / true), the pinned
 * blank-display-name → null clear, and that Save emits ONE merge-patch carrying all
 * four fields this dialog owns — re-sending them is safe because this is the surface
 * that owns them, and selecting Default clears the visibility override without a row
 * delete.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Folder } from '@tai42/studio-sdk';

import { ToolMetaEditDialog } from './ToolMetaEditDialog';
import type { ToolView } from './toolView';

/** A tool view with every field at its neutral default; override only what a case needs. */
function toolView(overrides: Partial<ToolView> = {}): ToolView {
  return {
    name: 'paris_weather',
    displayName: 'paris_weather',
    overlayDisplayName: null,
    hasCustomName: false,
    nativeTags: [],
    overlayTags: [],
    tags: [],
    folderId: null,
    hidden: false,
    overlayHidden: null,
    ...overrides,
  };
}

const NO_FOLDERS: readonly Folder[] = [];
const DEFAULT_OPTION = 'Default (follow the plugin)';

function renderDialog(tool: ToolView) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  const onCreateFolder = vi.fn<(name: string, parentId: string | null) => Promise<string>>(() =>
    Promise.resolve('f-new'),
  );
  render(
    <ToolMetaEditDialog
      tool={tool}
      folders={NO_FOLDERS}
      open
      onOpenChange={onOpenChange}
      onCreateFolder={onCreateFolder}
      onSubmit={onSubmit}
      saving={false}
      disabled={false}
    />,
  );
  return { onSubmit, onOpenChange };
}

describe('ToolMetaEditDialog — visibility prefill', () => {
  it('checks Default when the overlay defers (hidden = null)', () => {
    renderDialog(toolView({ overlayHidden: null }));

    expect(screen.getByRole('radio', { name: DEFAULT_OPTION })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Shown' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Hidden' })).not.toBeChecked();
  });

  it('checks Shown when the overlay unhides (hidden = false)', () => {
    renderDialog(toolView({ overlayHidden: false }));

    expect(screen.getByRole('radio', { name: 'Shown' })).toBeChecked();
  });

  it('checks Hidden when the overlay hides (hidden = true)', () => {
    renderDialog(toolView({ overlayHidden: true }));

    expect(screen.getByRole('radio', { name: 'Hidden' })).toBeChecked();
  });
});

describe('ToolMetaEditDialog — save emits a four-field merge-patch', () => {
  it('re-sends every field it owns unchanged (all four present)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog(
      toolView({
        overlayDisplayName: 'Paris',
        displayName: 'Paris',
        hasCustomName: true,
        overlayTags: ['geo'],
        tags: ['geo'],
        overlayHidden: true,
        hidden: true,
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({
      display_name: 'Paris',
      tags: ['geo'],
      folder_id: null,
      hidden: true,
    });
  });

  it('maps Default → hidden:null (clearing the override, not a row delete)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog(toolView({ overlayHidden: true, hidden: true }));

    await user.click(screen.getByRole('radio', { name: DEFAULT_OPTION }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ hidden: null }));
  });

  it('maps Shown → hidden:false', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog(toolView({ overlayHidden: null }));

    await user.click(screen.getByRole('radio', { name: 'Shown' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ hidden: false }));
  });

  it('sends display_name:null when the name is blanked (never an empty string)', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog(
      toolView({ overlayDisplayName: 'Paris', displayName: 'Paris', hasCustomName: true }),
    );

    await user.clear(screen.getByLabelText('Display name'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ display_name: null }));
  });

  it('carries a newly typed display name and an added tag', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog(toolView());

    await user.type(screen.getByLabelText('Display name'), 'Paris');
    await user.type(screen.getByRole('textbox', { name: 'Tags' }), 'geo');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith({
      display_name: 'Paris',
      tags: ['geo'],
      folder_id: null,
      hidden: null,
    });
  });
});

describe('ToolMetaEditDialog — cancel', () => {
  it('closes without submitting when Cancel is pressed', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = renderDialog(toolView());

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('ToolMetaEditDialog — store not configured', () => {
  it('replaces the form with the muted OFF note when the overlay store is disabled', () => {
    render(
      <ToolMetaEditDialog
        tool={toolView()}
        folders={NO_FOLDERS}
        open
        onOpenChange={vi.fn()}
        onCreateFolder={vi.fn(() => Promise.resolve('f-new'))}
        onSubmit={vi.fn()}
        saving={false}
        disabled
      />,
    );

    expect(screen.getByTestId('feature-disabled')).toBeInTheDocument();
    expect(screen.getByText(/TOOL_META_STORE_PG_PASSWORD/)).toBeInTheDocument();
    // No editable form and no Save affordance while the store is off.
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
