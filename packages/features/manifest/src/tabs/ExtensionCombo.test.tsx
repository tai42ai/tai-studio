import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ExtensionCombo } from './ExtensionCombo';

describe('ExtensionCombo', () => {
  it('renders each element as a badge joined by a muted plus', () => {
    const { container } = render(<ExtensionCombo combo={['wrap_a', 'ask_external']} />);

    expect(screen.getByText('wrap_a')).toBeInTheDocument();
    expect(screen.getByText('ask_external')).toBeInTheDocument();
    expect(container).toHaveTextContent('wrap_a+ask_external');
  });

  it('keeps a config element collapsed and shows its marker string once expanded', async () => {
    render(
      <ExtensionCombo combo={[{ name: 'label_ext', config: { label: '!ENV ${EXT_TOKEN}' } }]} />,
    );

    expect(screen.getByText('label_ext')).toBeInTheDocument();
    expect(screen.queryByText(/EXT_TOKEN/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByText(/!ENV \$\{EXT_TOKEN\}/)).toBeInTheDocument();
  });
});
