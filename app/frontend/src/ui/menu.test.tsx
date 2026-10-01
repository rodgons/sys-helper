import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Menu, MenuItem } from './menu';

function renderMenu(onSelect = vi.fn()) {
  render(
    <>
      <Menu label="Account" trigger="Open">
        <MenuItem onSelect={onSelect}>Sign out</MenuItem>
      </Menu>
      <p>Outside</p>
    </>,
  );
  return onSelect;
}

describe('Menu', () => {
  it('opens from its button and runs the chosen item', () => {
    const onSelect = renderMenu();
    const button = screen.getByRole('button', { name: 'Account' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const item = screen.getByRole('menuitem', { name: 'Sign out' });
    expect(item).toHaveFocus();

    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the button', () => {
    renderMenu();
    const button = screen.getByRole('button', { name: 'Account' });
    fireEvent.click(button);

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes on a click outside', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));

    fireEvent.pointerDown(screen.getByText('Outside'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
