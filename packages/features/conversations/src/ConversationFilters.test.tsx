/**
 * The filter bar writes the page's search: the status select commits on change, the
 * address + text fields commit on submit, and a blank field is dropped (never an
 * empty `?address=`). The current URL is preserved through each merge-edit.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ConversationFilters } from './ConversationFilters';
import { renderWithProviders } from './test-utils';

describe('ConversationFilters', () => {
  it('commits a status choice immediately, preserving the route', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<ConversationFilters search={{ route: 'chat' }} />, {
      client: {},
    });

    await user.click(screen.getByRole('combobox', { name: 'Delivery status' }));
    await user.click(screen.getByRole('option', { name: 'Failed' }));

    expect(navigate).toHaveBeenCalledWith('conversations', { route: 'chat', status: 'failed' });
  });

  it('drops the status filter when Any status is chosen', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(
      <ConversationFilters search={{ route: 'chat', status: 'failed' }} />,
      { client: {} },
    );

    await user.click(screen.getByRole('combobox', { name: 'Delivery status' }));
    await user.click(screen.getByRole('option', { name: 'Any status' }));

    expect(navigate).toHaveBeenCalledWith('conversations', { route: 'chat' });
  });

  it('commits the address + text needle on submit, trimming and dropping blanks', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<ConversationFilters search={{ route: 'chat' }} />, {
      client: {},
    });

    await user.type(screen.getByRole('textbox', { name: 'Address' }), '  ana  ');
    await user.type(screen.getByRole('textbox', { name: 'Search text' }), 'widget');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(navigate).toHaveBeenCalledWith('conversations', {
      route: 'chat',
      address: 'ana',
      q: 'widget',
    });
  });

  it('re-seeds the boxes from the committed URL values', () => {
    renderWithProviders(
      <ConversationFilters search={{ route: 'chat', address: '+1555', q: 'widget' }} />,
      { client: {} },
    );
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveValue('+1555');
    expect(screen.getByRole('textbox', { name: 'Search text' })).toHaveValue('widget');
  });
});
