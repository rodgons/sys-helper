import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeMenu } from './theme-menu';

describe('ThemeMenu', () => {
  it('checks the current choice and reports a new one', () => {
    const onChange = vi.fn();
    render(<ThemeMenu choice="system" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));

    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'false',
    );

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Dark' }));

    expect(onChange).toHaveBeenCalledWith('dark');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens on the current choice', () => {
    render(<ThemeMenu choice="light" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));

    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toHaveFocus();
  });
});
