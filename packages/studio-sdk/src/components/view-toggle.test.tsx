import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ViewToggle, useViewMode, type ViewMode } from '../index';

afterEach(() => {
  globalThis.localStorage.clear();
});

describe('ViewToggle', () => {
  it('renders both view options as a segmented radio group with accessible names', () => {
    render(<ViewToggle value="list" onValueChange={() => undefined} aria-label="Tools view" />);
    const group = screen.getByRole('radiogroup', { name: 'Tools view' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'List view' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Card view' })).toBeInTheDocument();
  });

  it('reflects the controlled value', () => {
    render(<ViewToggle value="cards" onValueChange={() => undefined} aria-label="Tools view" />);
    expect(screen.getByRole('radio', { name: 'Card view' })).toBeChecked();
  });

  it('reports the chosen mode through onValueChange', async () => {
    const onValueChange = vi.fn();
    render(<ViewToggle value="list" onValueChange={onValueChange} aria-label="Tools view" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Card view' }));
    expect(onValueChange).toHaveBeenCalledWith('cards');
  });
});

describe('useViewMode', () => {
  it('returns the fallback when nothing is stored', () => {
    const { result } = renderHook(() => useViewMode('tools', 'cards'));
    expect(result.current[0]).toBe('cards');
  });

  it('defaults the fallback to list', () => {
    const { result } = renderHook(() => useViewMode('tools'));
    expect(result.current[0]).toBe('list');
  });

  it('persists the choice per surface across a remount', () => {
    const first = renderHook(() => useViewMode('flows'));
    act(() => {
      first.result.current[1]('cards');
    });
    expect(first.result.current[0]).toBe('cards');
    // A different surface is unaffected.
    const other = renderHook(() => useViewMode('tools'));
    expect(other.result.current[0]).toBe('list');
    // A fresh mount of the same surface reads the stored choice.
    const second = renderHook(() => useViewMode('flows'));
    expect(second.result.current[0]).toBe('cards');
  });

  it('degrades to in-memory when storage throws (never a thrown boot)', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useViewMode('tools', 'list'));
    expect(result.current[0]).toBe('list');
    act(() => {
      result.current[1]('cards');
    });
    expect(result.current[0]).toBe('cards');
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

// Type-level: the setter accepts exactly a ViewMode.
const _mode: ViewMode = 'list';
void _mode;
