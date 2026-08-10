import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card, EntityCardGrid } from '../index';

describe('EntityCardGrid', () => {
  it('renders children on the shared card grid as an accessible list', () => {
    render(
      <EntityCardGrid aria-label="Tools">
        <Card interactive>alpha</Card>
        <Card interactive>beta</Card>
      </EntityCardGrid>,
    );
    const list = screen.getByRole('list', { name: 'Tools' });
    expect(list).toHaveClass('tai-grid-cards');
    expect(list).toHaveTextContent('alpha');
    expect(list).toHaveTextContent('beta');
  });
});
