import { ApiError } from '@tai42/api-client';
import type { ToolListQuery } from '@tai42/studio-sdk';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MultiToolPicker } from './MultiToolPicker';

const REFUSED: ToolListQuery = {
  data: undefined,
  isPending: false,
  isError: true,
  isSuccess: false,
  error: new ApiError('forbidden', 403),
  refetch: vi.fn(),
};

describe('MultiToolPicker', () => {
  it('adds one whole typed name per entry when the session may not list tools', async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = vi.fn();
    render(
      <MultiToolPicker query={REFUSED} value={['echo']} onChange={onChange} idPrefix="tools" />,
    );

    const input = screen.getByRole('textbox', { name: 'Add a tool' });
    await user.type(input, 'notify{Enter}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith(['echo', 'notify']);
    expect(input).toHaveValue('');
  });
});
